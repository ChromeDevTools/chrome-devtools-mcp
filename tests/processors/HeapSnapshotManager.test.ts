/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {HeapSnapshotManager} from '../../src/processors/HeapSnapshotManager.js';
import {DevTools} from '../../src/third_party/index.js';

describe('HeapSnapshotManager', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('disposes the worker when snapshot loading fails', async () => {
    const disposeSpy = sinon.spy(
      DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy
        .prototype,
      'dispose',
    );

    const manager = new HeapSnapshotManager();

    // A path that passes into #loadSnapshot but fails on read. The worker is
    // created before the read, so a failed load must still dispose it,
    // otherwise it leaks for the life of the process (it is never added to the
    // #snapshots map, so dispose()/disposeAll() cannot reach it).
    await assert.rejects(
      manager.getSnapshot('/nonexistent/does-not-exist.heapsnapshot'),
    );

    sinon.assert.calledOnce(disposeSpy);
  });
});
