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

"use strict";

const Machine = require("../machine.js");
let machine = new Machine();

let log, err;
[log, err] = require('./logerr.js');

let list = [
  '.boot',
  '.boot/failed',
  '.boot/booting',
  '.boot/booting.robot',
  '.boot/booting.robot/unknown',
  '.boot/booting.robot/expectingjcbs',
  '.boot/booting.robot/discoveringjcbs',
  '.boot/booting.robot/failed',
  '.boot/booting.robot/comparingfirmware',
  '.boot/booting.robot/loadingfirmware',
  '.boot/booting.robot/ready',
  '.boot/running',
  '.net',
  '.net.ipv4assign',
  '.net.ipv4assign/static',
  '.net.ipv4assign/dhcp',
  '.net.ipv4assign/zeroconf',
  '.wcam',
  '.hcam',
];

// --------------------------------------------------------------
// Section 1:  Direct calls to _addState() - no events generated
list.forEach( path => {
  const result = machine._addState(path);
  err(result);
});

// 1. count added paths, and check to make sure they all exist in the machine.
//    verify that three of them are variable paths.

const origPaths = list.length;
const arr = machine.getAllPaths();
if (arr.length !== origPaths+1) {
  err(`expecting ${origPaths+1} paths, got ${arr.length}`);
}

const varPaths = list.filter( path => {
  const state = machine.getState(path);
  return state.hasOwnProperty("curr");
});

if (varPaths.length !== 3) { err(`expecting 3 variable paths, got ${varPaths.length}`); }

if (! machine.isVariableParent('.net.ipv4assign')) {
  err(`should be variableParent!`);
}

if (machine.getCurrentChildName('.net.ipv4assign') !== 'static') {
  err(`child should be static!`);
}

// 2. for a few selected states, check parent state name

let s = machine.getState('.net');
if (s.parent.name !== "") {
  err(`bad parent for .net: ${JSON.stringify(s.parent)}`);
}
s = machine.getState('.boot/booting.robot/comparingfirmware');
if (s.parent.name !== 'robot') {
  err(`bad parent for comparingFirmware: ${JSON.stringify(s.parent)}`);
}
s = machine.getState('.boot/booting.robot');
if (s.parent.name !== 'booting') {
  err(`bad parent for robot: ${JSON.stringify(s.parent)}`);
}

// --------------------------------------------------------------
// interpret()

// interpret once
machine = new Machine();
let gotNewMachineEvent = false;
function newMachineListener(block) {
  gotNewMachineEvent = true;
  // console.log(`got block with ${block.length} elements`);
}

machine.addBlockListener(newMachineListener);

let block = list.map( state => `P ${state}` );
err(machine.interpret(block));

machine.removeBlockListener(newMachineListener);

// interpret same block again: should be no-op
let s1 = machine.getSerialization();
err(machine.interpret(block));
let s2 = machine.getSerialization();
let results = s1.map( (s, i) => (s === s2[i]) );
err(results.find( r => (!r) ));


function equalArray(a1, a2) {
  if (a1.length !== a2.length) { return false; }
  const results = a1.map( (e, i) => e === a2[i] );
  const unequal = results.find( r => r !== true );
  return unequal === undefined;
}

// 3. check getCurrent, then setCurrent, and verify that event is not triggered

const sPath = '.boot/booting.robot';
if (! machine.exists(sPath + '/unknown')) {
  err(`.boot/booting.robot: expecting unknown, got ${curr}`);
}

let event3Triggered = false;
machine.addBlockListener(event3Listener);

function event3Listener(arr) {
  err("event3 should not be triggered when we call setCurrent directly!");
  event3Triggered = true;
  err(arr.length === 1);
  err(arr[0].startsWith('C'));
}

machine.setCurrent(sPath, 'expectingjcbs');
if (! machine.exists(sPath + '/expectingjcbs')) {
  err(`${sPath}: failed to set current state to expectingjcbs`);
}

let r3m = machine.removeBlockListener(event3Listener);
err(r3m);

// 4. getCurrentPaths; verify that there are 8.

const currPaths = machine.getCurrentPaths();
if (currPaths.length !== 8) {
  err(`expecting 8 currPaths; got ${currPaths.length}`);
}


// 5. Set data to a leaf state that is not a variable leaf.
//    It should work, and it should also trigger a registered listener.
//    Also try to get back the data you set.
//    Then remove the eventListener. Setting data should no longer
//    trigger the listener.

let event5Triggered = false;
let should5Trigger = true;
function event5Listener(arr) {
  event5Triggered = true;
  if (should5Trigger === false) {
    err(`fooListener should not have been called!`);
  }
  err(arr.length === 1);
  err(arr[0].startsWith("D"));
  err(arr[0].endsWith("foo"));
}
let r5 = machine.addBlockListener(event5Listener);
err(r5);

[
  '.boot/booting.robot/unknown',
  '.wcam',
].forEach( path => {
  if (! machine.isLeaf(path)) {
    err(`${path} should be leaf!`);
  }
  if (! machine.isVariableLeaf(path)) {
    if (machine.getData(path) !== "") {
      err(`${path} getData() should have returned empty string!`);
    }
    err(machine.interpret([`D ${path} foo`]));
    if (machine.getData(path) !== "foo") {
      err(`${path} getData() should have returned foo!`);
    }
  }
});

r5 = machine.removeBlockListener(event5Listener);
if (r5 !== null) {
  err(`removeBlockListener returned ${r5}`);
}
should5Trigger = false;
machine.setData(".wcam", "bar");
if (machine.getData(".wcam") !== "bar") {
  err(`${path} getData() should have returned bar!`);
}

// 6. empty out the tree; verify it is empty.
machine.makeEmpty();
if (! machine.exists("")) {
  err("machine should have root path!");
}
if (machine.exists(".boot")) {
  err("machine should not have .boot!");
}

// 7. try adding paths with nonexistent parent sequences

let r7;
r7 = machine.interpret(['P .a.b.c']);
if (r7 !== null) {
  err(`addState .a.b.c should be null!`);
}
if (! machine.exists('.a.b')) {
  err(`path .a.b should exist!`);
}
r7 = machine.interpret(['P .a.b.c.d']);
if (r7 !== null) {
  err(`addState .a.b.c.d should be null!`);
}
r7 = machine.interpret(['P .a.b.c/d']);
if (r7 === null) {
  err(`_addState .a.b.c/d should have failed!`);
}
if (! r7.match(/concurrent parent/)) {
  err(`expecting to match /concurrent parent/; got: ${r7}`);
}
r7 = machine.interpret(['P ']);
if (r7 !== null) {
  err(`addState "": expecting success; got: ${r7}`);
}
r7 = machine.interpret(['P foo']);
if (r7 === null) {
  err(`addState "foo": expecting failure!`);
} else if (! r7.match(/bad path/)) {
  err(`addState "foo": expecting bad path failure!`);
}

// interpretOp - toggle parents on and off; see effect on children
let r9;
machine = new Machine();
r9 = machine.interpret(['P .j/k.foo', 'P .j/l.bar', 'C .j l' ]);
err(r9);

if (! machine.getCurrentPaths().find( p => p.endsWith("bar") )) {
  err(`expecting .j/l.bar to be current!`);
}
machine.interpretOp('C .j k');
if (! machine.getCurrentPaths().find( p => p.endsWith("foo") )) {
  err(`expecting .j/k.foo to be current!`);
}

// interpretOp - toggle data on and off; see effect
r9 = machine.interpret(['P .z', 'D .z zebra']);
err(r9);
if (! machine.getData('.z') || (machine.getData('.z') !== 'zebra')) {
  err(`expecting data = zebra! got ${machine.getData('.z')}`);
}
r9 = machine.interpret(['P .z', 'D .z ']);
err(r9);
if (typeof machine.getData('.z') !== 'string' || (machine.getData('.z').length !== 0)) {
  err(`expecting data = ''! got |${machine.getData('.z')}|`);
}

// -------------------------------------------------------------------------
// new Machine
// -------------------------------------------------------------------------

machine = new Machine();

// empty the machine and recreate
r9 = machine.interpret(['E', 'P .x/k.foo']); err(r9);
r9 = machine.getSerialization();
err(r9.length === 4);
r9 = machine.interpret(['P .j/k.foo', 'E', 'P .j/k.foo']); err(r9);
r9 = machine.getSerialization();
err(r9.length === 4);

// data append: foo, bar, empty line, baz
r9 = machine.interpret(['P .j/k.foo', 'D .j/k.foo foo']); err(r9);
r9 = machine.interpret(['A .j/k.foo bar']); err(r9);
r9 = machine.interpret(['A .j/k.foo ', 'A .j/k.foo baz']);    err(r9);

const dataValues = machine.getData('.j/k.foo');
err(dataValues[0] === 'foo');
err(dataValues[1] === 'bar');
err(dataValues[2] === '');
err(dataValues[3] === 'baz');

// getSerialization - serialization must preserve paths
checkSerialTransfer(machine);
r9 = machine.interpret(['P .j/l', 'C .j l']); err(r9);
checkSerialTransfer(machine);

// data append to beyond limit of 100 lines
for (let i=0; i<105; i++) {
  r9 = machine.interpret([`A .j/k.foo data-${i}`]); err(r9);
}
const firstElem = machine.getData('.j/k.foo')[0];
if (firstElem !== 'data-5') {
  err(`firstElem should be |data-5|; got |${firstElem}|`);
}
checkSerialTransfer(machine);
let sLength;
sLength = machine.getSerialization().length;
if (sLength !== 106) { err(`serialization should have been 106; got ${sLength}`); }

// overwrite appended data with a single empty line
r9 = machine.interpret(['D .j/k.foo']); err(r9);
const emptyElem = machine.getData('.j/k.foo');
if (emptyElem !== '') {
  err(`getData should have been empty string; got |${emptyElem}|`);
}
checkSerialTransfer(machine);
sLength = machine.getSerialization().length;
if (sLength !== 6) { err(`serialization should have been 6; got ${sLength}`); }

/**
   @function(checkSerialTransfer) - serialize, unserialize, check
 */

function checkSerialTransfer(orig) {
  let allPaths = orig.getAllPaths();
  let currentPaths = orig.getCurrentPaths();
  const serial = orig.getSerialization();
  const machine = new Machine();
  const res = machine.interpret(serial);
  err(res);
  if (! machine.getAllPaths().every( (p, i) => p === allPaths[i] )) {
    err(`allPaths do not match after serialization!`);
    console.log(allPaths);
    console.log(machine.getAllPaths());
  }
  if (! machine.getCurrentPaths().every( (p, i) => p === currentPaths[i] )) {
    err(`currentPaths do not match after serialization!`);
    console.log(currentPaths);
    console.log(machine.getCurrentPaths());
  }
  if (! machine.getAllPaths().filter(p => machine.isDataLeaf(p)).every( p => {
    return machine.getData(p) === orig.getData(p);
  })) {
    console.log(`data do not match after serialization!`);
    let paths = orig.getAllPaths().filter(p => orig.isDataLeaf(p));
    paths.forEach(p => console.log(`orig: ${p} = |${machine.getData(p)}|`));
    paths = machine.getAllPaths().filter(p => machine.isDataLeaf(p));
    paths.forEach(p => console.log(`machine: ${p} = |${machine.getData(p)}|`));
    err('dying');
  }
}

// --------------------------

process.on('beforeExit', code => {
  if (code === 0) {
    if (event3Triggered) {
      err(`event3 was triggered!`);
    }
    if (!event5Triggered) {
      err(`event5 was never triggered!`);
    }
    if (! gotNewMachineEvent) {
      err('failed to get newmachine event on finishEditing()');
    }
  }
});
