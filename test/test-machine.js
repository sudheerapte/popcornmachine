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

const Machine = require("../js/gen/machine-module.js");
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


// We should already be in editing mode on creation

if (! machine.isEditing()) {
  err(`should already be in editing mode on creation`);
}

if (! machine.startEditing().match(/already editing/)) {
  err(`should already be in editing mode on creation`);
}

// Error checking for editing mode

machine.finishEditing();
if (! machine.addStates(list).match(`not editing`)) {
  err(`must be in editing mode to add states`);
}

// check 'newmachine' event can be listened to

let gotNewMachineEvent = false;
let newMachineListener = () => gotNewMachineEvent = true ;
machine.addEventListener('newmachine', newMachineListener);

machine.startEditing();
if (machine.addStates(list) !== null) {
  err(`must be able to add states in editing mode`);
}
machine.finishEditing(); // should generate newmachine event
machine.removeEventListener('newmachine', newMachineListener);

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

// 3. check getCurrent, then setCurrent, and verify that event is triggered

const sPath = '.boot/booting.robot';
if (! machine.exists(sPath + '/unknown')) {
  err(`.boot/booting.robot: expecting unknown, got ${curr}`);
}

let event3Triggered = false;
machine.addEventListener('statechange', event3Listener);

function event3Listener(path, name) {
  event3Triggered = true;
  if (name !== 'expectingjcbs') {
    err(`${path}: expecting expectingjcbs; got ${name}`);
  }
}

machine.setCurrent(sPath, 'expectingjcbs');
if (! machine.exists(sPath + '/expectingjcbs')) {
  err(`${sPath}: failed to set current state to expectingjcbs`);
}

machine.removeEventListener('statechange', event3Listener);

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
function fooListener(path, value) {
  event5Triggered = true;
  if (should5Trigger === false) {
    err(`fooListener should not have been called!`);
  }
  if (value !== 'foo') {
    err(`${path}: expecting foo; got ${value}`);
  }
}
let r5 = machine.addEventListener('datachange', fooListener);
if (r5 !== null) {
  err(`addEventListener returned ${r5}`);
}

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
    machine.setData(path, "foo");
    if (machine.getData(path) !== "foo") {
      err(`${path} getData() should have returned foo!`);
    }
  }
});

r5 = machine.removeEventListener('datachange', fooListener);
if (r5 !== null) {
  err(`removeEventListener returned ${r5}`);
}
should5Trigger = false;
machine.setData(".wcam", "foo");
if (machine.getData(".wcam") !== "foo") {
  err(`${path} getData() should have returned foo!`);
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
machine.startEditing();
r7 = machine.addState('.a.b.c');
if (r7 !== null) {
  err(`addState .a.b.c should be null!`);
}
if (! machine.exists('.a.b')) {
  err(`path .a.b should exist!`);
}
r7 = machine.addState('.a.b.c.d');
if (r7 !== null) {
  err(`addState .a.b.c.d should be null!`);
}
r7 = machine.addState('.a.b.c/d');
if (r7 === null) {
  err(`addState .a.b.c/d should have failed!`);
}
if (! r7.match(/concurrent parent/)) {
  err(`expecting to match /concurrent parent/; got: ${r7}`);
}
r7 = machine.addState('');
if (r7 !== null) {
  err(`addState "": expecting success; got: ${r7}`);
}
r7 = machine.addState('foo');
if (r7 === null) {
  err(`addState "foo": expecting failure!`);
} else if (! r7.match(/bad path/)) {
  err(`addState "foo": expecting bad path failure!`);
}

// test 8 - listeners should not be triggered when editing.
//  listeners should be triggered after finishEditing.
let r8;

// r8DummyListener should never be called, because we are still editing
r8 = machine.addEventListener('datachange', r8DummyListener);
if (r8 !== null) {
  err(`addEventListener returned ${r8}`);
}

function r8DummyListener(path, name) {
  err(`r8DummyListener triggered! ${path} ${name}`);
}

let r8eventTriggered = false;

function r8Listener(path, name) {
  r8eventTriggered = true;
}
machine.addEventListener('statechange', r8Listener);

r8 = machine.addState('.foo');
r8 = machine.addState('.foo/a');
r8 = machine.addState('.foo/b');

r8 = machine.setCurrent('.foo', 'b');
if (r8 !== null) {
  err(`setCurrent b: expecting success!`);
}

r8 = machine.removeEventListener('datachange', r8DummyListener); 
if (r8 !== null) {
  err(`removeEventListener returned ${r8}`);
}

machine.finishEditing();
r8 = machine.setCurrent('.foo', 'b'); // this should trigger r8Listener

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


// getSerialization - serialization must preserve paths

checkSerialTransfer(machine);
machine.interpretOp('C .j l');
checkSerialTransfer(machine);


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
    if (!event3Triggered) {
      err(`event3 was never triggered!`);
    }
    if (!event5Triggered) {
      err(`event5 was never triggered!`);
    }
    if (! r8eventTriggered) {
      err(`r8event was never triggered!`);
    }
    if (! gotNewMachineEvent) {
      err('failed to get newmachine event on finishEditing()');
    }
  }
});
