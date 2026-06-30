'use strict';

// Note: This file is not executed during tests. It is only used to document how
// heap-1.heapsnapshot, heap-2.heapsnapshot, and heap-3.heapsnapshot were created,
// and to allow recreating them in the future if necessary.
//
// Heap snapshots were created with this command line:
//   d8 --allow-natives-syntax snapshot_diffs.js

function InitialObject(label, payloadSize) {
  this.kind = 'initial';
  this.label = label;
  this.payload = `${label}-` + 'x'.repeat(payloadSize);
  this.meta = {createdAt: Date.now()};
}

function NewObject(label, payloadSize) {
  this.kind = 'new';
  this.label = label;
  this.payload = `${label}-` + 'y'.repeat(payloadSize);
  this.extra = [1, 2, 3, 4, 5];
}

const refs = {
  a: new InitialObject('a', 200000),
  b: new InitialObject('b', 180000),
  keep: new InitialObject('keep', 220000),
};

%TakeHeapSnapshot('heap-1.heapsnapshot');

// Drop two refs by overwriting them with new objects.
refs.a = new NewObject('a-replacement', 210000);
refs.b = new NewObject('b-replacement', 190000);

%TakeHeapSnapshot('heap-2.heapsnapshot');

// Add five more NewObject refs.
refs.c = new NewObject('c-extra', 150000);
refs.d = new NewObject('d-extra', 160000);
refs.e = new NewObject('e-extra', 170000);
refs.f = new NewObject('f-extra', 180000);
refs.g = new NewObject('g-extra', 190000);

%TakeHeapSnapshot('heap-3.heapsnapshot');

print(
  'Wrote heap-1.heapsnapshot, heap-2.heapsnapshot, and heap-3.heapsnapshot',
);
