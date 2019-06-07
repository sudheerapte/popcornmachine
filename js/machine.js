/**
   Copyright 2018 Sudheer Apte

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

/**
   This class represents one state machine tree. When you create an
   instance, it has only the root path "" and is in edit mode.

   External API:

   interpret(array)

   Takes an array of commands called a "block" and executes them all
   in sequence as a transaction. On error, it returns an error message.
   On success it returns null.

   Internal representation:

   A parent state can be either:
   (a) a variable parent, OR
   (b) a concurrent parent.

   Leaf states can be either:
   (a) children of a variable parent, OR
   (b) children of a concurrent parent having a 'data' member.

   All states are represented with a simple Javascript object with
   two attributes:

     name: the short string name of this state
     parent: a pointer to the parent state object.
             (the parent pointer is not present in the root state)

   Leaf states have only the above two members. Parent states have one
   additional member:

     cc: an array containing the short names of all child states

   In addition, a variable parent state also has a "curr" member,
   which has the *index* of the current sub-state.  By default, "curr"
   is set to zero.

   All the states in the machine are indexed by their full path in the
   STATE_TREE map. The root state's path is always the empty string
   "", so you can start a traversal by looking up that key.  The value
   of the key will be a state object, and if it is a parent state,
   then it will contain its children's short names in "cc".

   Each child state object can be found by appending either a "." or a
   "/" to the parent's key, and then the child's short name, to form
   the child's key in the STATE_TREE map.

 */

const MAX_DATA_LENGTH = 100; /* data leaf value number of strings */

class Machine {

  constructor() {
    this.STATE_TREE = new Map();
    this.listeners = [];
    // Special case: top-level state has no parent.
    this.STATE_TREE.set("", { name: ""} );
  }

  /**
     Removing all the states:
        makeEmpty()
        Removes all the states, leaving only the special root state.
   */

  makeEmpty() {
    this.STATE_TREE = new Map();
    this.STATE_TREE.set("", { name: ""} );
  }

  /**
     Utilities:
     @function(normalizePath)
     @function(exists) @arg(path)
  */

  normalizePath(str) {  // return null if str is illegal
    if (! str) { return ""; }
    if (str.match(Machine.PATHPAT)) {
      return str.trim().toLowerCase();
    } else {
      return null;
    }
  }

  exists(path) {
    path = this.normalizePath(path);
    if (path === null) { return false; }
    return this.STATE_TREE.has(path);
  }

  /**
     @function(interpretOp)
     interpret one line containing a command.
     @return(null) iff successful, else error string

     Empty line returns null (success)
     Comment line # returns null
     P command
     C command
     D command
   */

  interpretOp(str) {
    if (! str) { return null; }
    str = str.trim();
    if (str.match(/^#/)) { return null; } 
    let m;

    let path, child, data, frag;

    if (str.startsWith('C')) {
      m = str.match(Machine.CPAT);
      if (m) {
	path = m[1];
	child = m[2];
	if (path.endsWith('/')) { path = path.slice(0,path.length-1); }
	return this.setCurrent(path, child);
      } else {
	return `interpretOp: ${str}\nC - syntax must be ${Machine.CPAT}`;
      }
    } else if (str.startsWith('D')) {
      m = str.match(Machine.DPAT);
      if (m) {
	return this.setData(m[1], m[2]);
      } else {   // Allow for empty string value
	m = str.match(Machine.DNULLPAT);
	if (m) {
	  return this.setData(m[1], "");
	} else {
	  return `interpretOp: ${str}\nD - syntax must be ${Machine.DPAT}`;
	}
      }
    } else if (str.startsWith('A')) {
      m = str.match(Machine.APAT);
      if (m) {
	return this.appendData(m[1], m[2]);
      } else { // Allow for empty string value
        m = str.match(Machine.ANULLPAT);
        if (m) {
          return this.appendData(m[1], "");
        } else {
	  return `interpretOp: ${str}\nA - syntax must be ${Machine.APAT}`;
        }
      }
    } else if (str.startsWith('P')) {
      if (str === 'P') { return null; } // special case: root path
      m = str.match(Machine.PPAT);
      if (m) {
        const path = this.normalizePath(m[1]);
        if (path === null) { return `P: bad path: ${path}`; }
	return this._addState(path);
      } else {
	return `interpretOp: ${str}\nP - syntax must be ${Machine.PPAT}`;
      }
    } else if (str.startsWith('E')) {
      if (str !== 'E') { return `interpretOp: E command must be standalone`; }
      this.makeEmpty();
      return null;
    } else {
      return `interpretOp: ${str}\nbad command: ${str.slice(0,1)}`;
    }
  }

  clone() {
    let clone = new Machine();
    const results = this.getSerialization().map( op => clone.interpretOp(op) );
    if (results.find( r => r !== null)) {
      return "internal error: unable to create clone!";
    } else {
      return clone;
    }
  }

  interpret(arr) {
    // First try the array on a clone. If it succeeds, interpret it and return null.
    // TODO: make interpret function more efficient without cloning every time
    let clone = this.clone();
    if (typeof clone === 'string') {
      return `interpret: ${clone}`;
    }
    let results = arr.map( op => clone.interpretOp(op) );
    let errResult = results.find( e => e !== null );
    if (errResult) {
      return errResult;
    }

    arr.forEach( op => {
      this.interpretOp(op)
    });
    this.listeners.forEach( func => func(arr) );
    return null;
  }

  // @function(getAllPaths) - all paths in parent-first sequence

  getAllPaths() {
    let arr = [""];
    let rootState = this.getState("");
    this._appendChildren("", rootState, arr);
    return arr;
  }

  // @function(getCurrentPaths) - only current paths in parent-first sequence

  getCurrentPaths() {
    let arr = [""];
    let rootState = this.getState("");
    this._appendCurrentChildren("", rootState, arr);
    return arr;
  }

  // @function(getSerialization) - a sequence of interpretops

  getSerialization() {
    let arr = this.getAllPaths();
    const serial = [];
    arr.forEach( path => {
      serial.push(`P ${path}`);
      const state = this.getState(path);
      const parent = state.parent;
      // Create "C" lines for the current state only if non-default
      if (parent &&
	  parent.hasOwnProperty("curr") &&
	  parent.curr !== 0 &&
	  parent.cc[parent.curr] === state.name) {
	const pair = this._snipChild(path);
	serial.push(`C ${pair[0]} ${pair[1]}`);
      }
      // Create "D" line only if non-empty data
      // Create "A" lines if data is an array
      if (parent && ! parent.hasOwnProperty("curr") && state.data !== null) {
        if (typeof state.data === 'string' && state.data !== "") {
	  serial.push(`D ${path} ${state.data}`);
        } else if (typeof state.data === 'object' && state.data.hasOwnProperty('length')) {
          state.data.forEach( d => serial.push(`A ${path} ${d}`) );
        }
      }
    });
    return serial;
  }

  // Various queries about paths
  
  isLeaf(path) {
    if (! this.exists(path)) { return false; }
    const state = this.getState(path);
    return ! state.hasOwnProperty("cc");
  }

  isVariableLeaf(path) {
    if (! this.exists(path)) { return false; }
    if (! path || path.length <= 0) { return false; }
    const state = this.getState(path);
    return (! state.hasOwnProperty("cc")) &&
      state.parent.hasOwnProperty("curr");
  }

  isDataLeaf(path) {
    const d = this.getData(path);
    return d !== null;
  }

  isVariableParent(path) {
    if (! this.exists(path)) { return false; }
    const state = this.getState(path);
    return state.hasOwnProperty("cc") && state.hasOwnProperty("curr");
  }

  getCurrentChildName(path) {
    if (! this.isVariableParent(path)) { return null; }
    const state = this.getState(path);
    return state.cc[state.curr];
  }

  addBlockListener(func) {
    this.listeners.push(func);
    return null;
  }

  removeBlockListener(func) {
    const pos = this.listeners.findIndex(elem => elem === func);
    if (pos > -1) {
      this.listeners.splice(pos, 1);
      return null;
    } else {
      return "removeBlockListener: no such function";
    }
  }

  /**
     @function(setCurrent)
     set the current child name of the given path.
     @return null iff successful.
     calls all the statechangeListeners if we are live
   */

  setCurrent(path, name) {
    if (! this.exists(path)) { return `setCurrent: bad path: ${path}`; }
    const s = this.getState(path);
    if (! s.hasOwnProperty("curr")) {
      return `setCurrent: not a variable state: ${path}`;
    } else {
      const i = s.cc.findIndex(elem => elem === name);
      if (i < 0) {
        return `setCurrent: no such child state: ${name}`;
      } else {
        s.curr = i;
      }
    }
    return null;
  }

  /**
     @function(setData) - set a data value on a non-variable leaf
     @arg(path) - path of non-variable leaf state
     @arg(value) - string value to be set
     @return(null) - iff set successfully
     @return(string) - if not set for any reason; reason is in string
     calls all the datachangeListeners.
   */

  setData(path, value) {
    if (! this.isLeaf(path)) { return `setData: ${path} is not a leaf`; }
    if (this.isVariableLeaf(path)) {
      return `setData: ${path} is a variable leaf`;
    }
    const s = this.getState(path);
    s.data = value;
    return null;
  }

  /*
    @function(appendData) - append a line of data to a data leaf.
    The usual result is that the data will be an array of strings,
    with the last element equal to the argument value.
    Return null iff OK, else return error string.

    The "value" must be a single string without any newlines.
    If there are any newlines, they will not be honored, i.e.,
    we will not create separate lines.
    The result will be an array with one more element than before,
    but limited to MAX_DATA_LENGTH lines. If more elements are
    appended, old elements will be shifted out and discarded.

    Special case: if the current data value is "", then appendData
    will replace the data with the new value.
   */

  appendData(path, value) {
    if (typeof value !== 'string') { return "appendData: value must be string"; }
    const d = this.getData(path);
    if (d === null) { return "appendData: bad path"; }
    if (typeof d === 'object' && d.hasOwnProperty('length')) {
      d.push(value);
      if (d.length > MAX_DATA_LENGTH) { d.shift(); }
      return null;
    }
    const s = this.getState(path);
    if (d === "") {
      s.data = value;
    } else {
      s.data = [ d, value ];
    }
    return null;
  }

  /**
     @function(getData) - get the data value for a non-variable leaf
     @arg(path) - path of non-variable leaf state
     @return(null) - iff not successful
     @return(string) - the data value; could be string or array of strings
   */

  getData(path) {
    if (! this.exists(path)) { return null; }
    if (! this.isLeaf(path)) { return null; }
    if (this.isVariableLeaf(path)) {
      return null;
    }
    const s = this.getState(path);
    if (! s.data) { return ""; }
    else { return s.data; }
  }


  // internal functions below this point
  // ------------------------------------------------------------------

  getState(path) {
    path = this.normalizePath(path);
    if (path === null) { return null; }
    if (this.STATE_TREE.has(path)) {
      return this.STATE_TREE.get(path);
    } else {
      return null;
    }
  }

  // _snipChild utility: convert x.y.z/foo -> [x.y.z, foo]
  
  _snipChild(path) { // returns array: [parent, child]
    const pos = path.lastIndexOf("/");
    if (pos === -1) { return null; }
    const childName = path.slice(pos+1);
    if (childName.includes(".")) { return null; }
    return [ path.slice(0, pos), childName ];
  }
	
  _appendCurrentChildren(path, state, arr) {
    if (! state.cc) { return; }

    let sep = ".";
    if (state.hasOwnProperty("curr")) { sep = "/" }

    if (sep === "/") { // variable state: follow only current child
      const name = state.cc[state.curr];
      if (name) {
	const cPath = path + sep + name;
	arr.push(cPath);
	let child = this.getState(cPath);
	if (child) {
	  this._appendCurrentChildren(cPath, child, arr);
	} 
      } else {
      }
    } else {   // concurrent state: append all children
      state.cc.forEach( name => {
	const cPath = path + sep + name;
	arr.push(cPath);
	let child = this.getState(cPath);
	if (child) {
          this._appendCurrentChildren(cPath, child, arr);
	}
      });
    }
  }

  _appendChildren(path, state, arr) {
    if (! state.cc) { return; }
    let sep = ".";
    if (state.hasOwnProperty("curr")) { sep = "/" }
    state.cc.forEach( name => {
      const cPath = path + sep + name;
      arr.push(cPath);
      let child = this.getState(cPath);
      if (child) {
        this._appendChildren(cPath, child, arr);
      }
    });
  }

  /**
     @function(_addState)
     Add a state given by path.
     If the state already exists, return null.
     If the "parent" portion already exists and the child can be added,
     then do it and return null.
     Try to do this recursively for grandparents.
     @return null iff successful, else string with error message
   */

  _addState(path) {
    if (this.exists(path)) { return null; }
    let dotPos = path.lastIndexOf(".");
    let slashPos = path.lastIndexOf("/");
    if (dotPos < 0 && slashPos < 0) {
      return `addState: bad path: |${path}|`;
    } else {
      let pos = dotPos;
      if (pos < slashPos) { pos = slashPos; }
      return this._addSubState(path.slice(0,pos), path[pos], path.slice(pos+1));
    }
  }

  _addSubState(parentPath, separator, name) {
    if (! name.match(/[A-Za-z0-9-]+/)) { return `Bad name: |${name}|`; }
    if (! separator.length === 1) {
      return `Bad separator length: |${separator.length}|`;
    }
    if (! separator.match(/\.|\//)) {
      return `Bad separator: |${separator}|`;
    }

    let state = {name: name};
    let p = this.STATE_TREE.get(parentPath);
    if (! p) {
      const result = this._addState(parentPath);
      if (result !== null) {
	return result;
      } else {
	p = this.STATE_TREE.get(parentPath);
      }
    }
    if (p.hasOwnProperty("data")) {
      return `parent has data - cannot add child`;
    }
    state.parent = p; 
    if (! p["cc"]) { p.cc = []; }
    if (! p.hasOwnProperty("curr") && p.cc.length > 0) {
      if (separator !== ".") {
	return `concurrent parent cannot add variable child`;
      }
    }
    if (p.hasOwnProperty("curr") && separator !== '/') {
      return `variable parent cannot add concurrent child`;
    }
    p.cc.push(name);
    if (separator === '/') {
      if (! p.hasOwnProperty("curr")) {
        p.curr = 0;
      }
    }
    const path = `${parentPath}${separator}${name}`;
    this.STATE_TREE.set(path, state);
    return null;
  }
}

Machine.PATHPAT =    /[A-Za-z0-9.\/-]+/;
Machine.PPAT = /^P\s+([A-Za-z0-9.\/-]+)$/;
Machine.CPAT = /^C\s+([A-Za-z0-9.\/-]+)\s+([A-Za-z0-9-]+)/;
Machine.DPAT = /^D\s+([A-Za-z0-9.\/-]+)\s+(.*)/;
Machine.DNULLPAT = /^D\s+([A-Za-z0-9.\/-]+)\s*/;
Machine.APAT = /^A\s+([A-Za-z0-9.\/-]+)\s+(.*)/;
Machine.ANULLPAT = /^A\s+([A-Za-z0-9.\/-]+)\s*/;
Machine.DCONTPAT = /^C\s(.*)/;

module.exports = Machine;

