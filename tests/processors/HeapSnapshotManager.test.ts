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

  it('rejects when a file without .heapsnapshot or .heaptimeline extension is passed', async () => {
    const manager = new HeapSnapshotManager();

    await assert.rejects(
      manager.getSnapshot('tests/fixtures/snapshot_diffs.js'),
      /must have a \.heapsnapshot or \.heaptimeline extension/,
    );
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

  // Verifies that the caching mechanism in HeapSnapshotManager correctly
  // distinguishes comparisons when the same "current" snapshot is compared
  // against different "base" snapshots. If the cache key (diffCacheKey) is
  // not unique per base snapshot, the second comparison might incorrectly
  // return cached results from the first comparison.
  it('compares the same current snapshot against different bases', async () => {
    const manager = new HeapSnapshotManager();
    try {
      const filePathA = 'tests/fixtures/heap-1.heapsnapshot';
      const filePathB = 'tests/fixtures/heap-2.heapsnapshot';
      const filePathC = 'tests/fixtures/heap-3.heapsnapshot';

      const firstDiff = await manager.getClassDiffs(filePathA, filePathC);
      const secondDiff = await manager.getClassDiffs(filePathB, filePathC);
      const firstNewObjectDiff = firstDiff.find(
        entry => entry.className === 'NewObject',
      );
      const secondNewObjectDiff = secondDiff.find(
        entry => entry.className === 'NewObject',
      );
      assert.ok(firstNewObjectDiff);
      assert.ok(secondNewObjectDiff);
      assert.equal(firstNewObjectDiff.addedCount, 7);
      assert.equal(secondNewObjectDiff.addedCount, 5);
    } finally {
      manager.dispose();
    }
  });

  it('throws when getNodesById is called with a non-existent class ID', async () => {
    const manager = new HeapSnapshotManager();
    try {
      const filePath = 'tests/fixtures/example.heapsnapshot';
      await manager.getAggregates(filePath);

      await assert.rejects(manager.getNodesById(filePath, 999999), {
        message: 'Class with ID 999999 not found in heap snapshot',
      });
    } finally {
      manager.dispose();
    }
  });

  it('throws when getDetailedClassDiff is called with an invalid classIndex', async () => {
    const manager = new HeapSnapshotManager();
    try {
      const filePathA = 'tests/fixtures/heap-1.heapsnapshot';
      const filePathB = 'tests/fixtures/heap-2.heapsnapshot';

      await assert.rejects(
        manager.getDetailedClassDiff(filePathA, filePathB, 99),
        /Invalid classIndex: 99. Total classes with changes: 10/,
      );
    } finally {
      manager.dispose();
    }
  });

  it('gets stats and staticData, and disposes snapshot', async () => {
    const manager = new HeapSnapshotManager();
    try {
      const filePath = 'tests/fixtures/example.heapsnapshot';
      const stats = await manager.getStats(filePath);
      assert.ok(stats.total > 0);
      assert.ok(stats.v8heap.total > 0);

      const staticData = await manager.getStaticData(filePath);
      assert.ok(staticData);
      assert.ok(staticData.nodeCount > 0);

      assert.strictEqual(manager.hasSnapshots(), true);
      assert.strictEqual(manager.disposeSnapshot(filePath), true);
      assert.strictEqual(manager.disposeSnapshot(filePath), false);
      assert.strictEqual(manager.hasSnapshots(), false);
    } finally {
      manager.dispose();
    }
  });
});
