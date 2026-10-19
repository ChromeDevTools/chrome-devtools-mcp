/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import {afterEach, it} from 'node:test';

import sinon from 'sinon';

// This module runs for every test file, so it must not import src code. Test
// files that use DevTools import tests/setupDevTools.ts.

// Root-level hooks are inherited by every test in the file, so one hook
// restores all Sinon stubs, spies, and fake timers after each test.
afterEach(() => {
  sinon.restore();
});

// This is run by Node when we execute the tests via the --import flag.
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
