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

class Machine {

  constructor() {
    this.STATE_TREE = new Map();
    this.statechangeListeners = [];
    this.datachangeListeners = [];
    this.newmachineListeners = [];
    // Special case: top-level state has no parent.
    this.STATE_TREE.set("", { name: ""} );
    this._live = false; // no events will be emitted
  }

  isLive() { return !! this._live }
  isEditing() { return ! this._live }

  /**
     Editing the tree -- without emitting any events.

     Adding new states:
        addState() and addStates()
        Take an existing path and a new name, creating the new child
        state.

     Removing all the states:
        makeEmpty()
        Removes all the states, leaving only the special root state.
	Makes and keeps the machine in editing state (i.e., not live)
   */

  makeEmpty() {
    this.STATE_TREE = new Map();
    this.STATE_TREE.set("", { name: ""} );
    this._live = false;
  }

  addState(path) {
    if (this.isLive()) { return `addState: not editing!` }
    path = this.normalizePath(path);
    if (path === null) { return `addState: bad path`; }
    return this._addState(path);
  }

  addStates(arr) {
    if (this.isLive()) { return `addStates: not editing!` }
    if (! arr.hasOwnProperty('length')) {
      return `addStates: not an array`;
    }
    this._live = false;
    arr.forEach( path => {
      const result = this._addState(path);
      if (result!== null) { return result; }
    });
    return null;
  }

  /**
     @function(finishEditing)
     Finish editing the tree.
     calls all the newmachineListeners.
   */
  startEditing() {
    if (! this._live) { return `startEditing: already editing`; }
    this._live = false;
    return null;
  }

  finishEditing() {
    if (this._live) { return `finishEditing: not editing`; }
    this._live = true;
    this.newmachineListeners.forEach( func => func() );
    return null;
  }

  /**
     Utilities:
     @function(normalizePath)
     @function(exists) @arg(path)
  */

  // pathPat() { return /[A-Za-z0-9.-\/]+/; }

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
      } else {
	return `interpretOp: ${str}\nA - syntax must be ${Machine.APAT}`;
      }
    } else if (str.startsWith('P')) {
      // for P command, we need to be in editing mode
      if (! this.isEditing()) { return `interpretOp ${str}\nP - not editing`; }
      m = str.match(Machine.PPAT);
      if (m) {
	return this.addState(m[1]);
      } else {
	return `interpretOp: ${str}\nP - syntax must be ${Machine.PPAT}`;
      }
    } else {
      return `interpretOp: ${str}\nbad command: ${str.slice(0,1)}`;
    }
  }

  interpret(arr) {
    let errors = arr.map( op => this.interpretOp(op) );
    return errors.find( e => e !== null );
  }

  // @function(getAllPaths) - all paths in parent-first sequence

  getAllPaths() {
    let arr = [""];
    let rootState = this.getState("");
    this._appendChildren("", rootState, arr);
    return arr;
  }

  getState(path) {
    path = this.normalizePath(path);
    if (path === null) { return null; }
    if (this.STATE_TREE.has(path)) {
      return this.STATE_TREE.get(path);
    } else {
      return null;
    }
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
      if (parent &&
	  ! parent.hasOwnProperty("curr") &&
	  state.data &&
	  typeof state.data === 'string' &&
	  state.data !== "") {
	serial.push(`D ${path} ${state.data}`);
      }
    });
    return serial;
  }

  // _snipChild utility: convert x.y.z/foo -> [x.y.z, foo]
  
  _snipChild(path) { // returns array: [parent, child]
    const pos = path.lastIndexOf("/");
    if (pos === -1) { return null; }
    const childName = path.slice(pos+1);
    if (childName.includes(".")) { return null; }
    return [ path.slice(0, pos), childName ];
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
    return (typeof this.getData(path)) === 'string';
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

  addEventListener(ev, func) {
    if (ev === 'statechange') {
      this.statechangeListeners.push(func);
    } else if (ev === 'datachange') {
      this.datachangeListeners.push(func);
    } else if (ev === 'newmachine') {
      this.newmachineListeners.push(func);
    } else {
      return `addEventListener: ${ev}: not a recognized event`;
    }
    return null;
  }

  removeEventListener(ev, func) {
    let listeners;
    if (ev === 'statechange') {
      listeners = this.statechangeListeners;
    } else if (ev === 'datachange') {
      listeners = this.datachangeListeners;
    } else if (ev === 'newmachine') {
      listeners = this.newmachineListeners;
    } else {
      return `removeEventListener: ${ev}: not a recognized event`;
    }
    const pos = listeners.findIndex(elem => elem === func);
    if (pos > -1) {
      listeners.splice(pos, 1);
    }
    return null;
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
	if (this._live) {
          this.statechangeListeners.forEach( listener => listener(path, name) );
	}
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
    if (this._live) {
      this.datachangeListeners.forEach( listener => listener(path, value) );
    }
    return null;
  }

  // TODO - add appendData() function and fix setData() to use same format

  /**
     @function(getData) - get the data value for a non-variable leaf
     @arg(path) - path of non-variable leaf state
     @return(null) - iff not successful
     @return(string) - if not set for any reason; reason is in string
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


  // ------------------ internal functions below this point -------------

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
Machine.DCONTPAT = /^C\s(.*)/;

let machine = new Machine();
