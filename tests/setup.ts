/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import '../src/polyfill.js';

import path from 'node:path';
import {it} from 'node:test';

if (!it.snapshot) {
  it.snapshot = {
    setResolveSnapshotPath: () => {
      // Internally empty
    },
    setDefaultSnapshotSerializers: () => {
      // Internally empty
    },
  };
}

// This is run by Node when we execute the tests via the --require flag.
it.snapshot.setResolveSnapshotPath(testPath => {
  // By default the snapshots go into the build directory, but we want them
  // in the tests/ directory.
  const correctPath = testPath?.replace(path.join('build', 'tests'), 'tests');
  return correctPath + '.snapshot';
});

// The default serializer is JSON.stringify which outputs a very hard to read
// snapshot. So we override it to one that shows new lines literally rather
// than via `\n`.
it.snapshot.setDefaultSnapshotSerializers([String]);
