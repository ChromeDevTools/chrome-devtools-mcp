/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {it} from 'node:test';
import path from 'node:path';

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
