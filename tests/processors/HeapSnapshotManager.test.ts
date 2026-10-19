/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, after, before} from 'node:test';

import sinon from 'sinon';

import {HeapSnapshotManager} from '../../src/processors/HeapSnapshotManager.js';
import {DevTools} from '../../src/third_party/index.js';

describe('HeapSnapshotManager', () => {
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

  // Each loaded snapshot starts a new worker, which takes seconds. Tests that
  // only read snapshots share one manager, so each fixture loads one time.
  describe('with heap-1, heap-2 and heap-3 fixtures', () => {
    const filePathA = 'tests/fixtures/heap-1.heapsnapshot';
    const filePathB = 'tests/fixtures/heap-2.heapsnapshot';
    const filePathC = 'tests/fixtures/heap-3.heapsnapshot';
    let manager: HeapSnapshotManager;

    before(() => {
      manager = new HeapSnapshotManager();
    });

    after(() => {
      manager.dispose();
    });

    it('assigns class diff indices that resolve to the same detailed diff', async () => {
      const {classDiffs} = await manager.getClassDiffs(filePathA, filePathB);
      assert.deepStrictEqual(
        classDiffs.map(diff => diff.index),
        classDiffs.map((_, position) => position),
      );

      const lastDiff = classDiffs.at(-1);
      assert.ok(lastDiff);
      const {classDiff} = await manager.getDetailedClassDiff(
        filePathA,
        filePathB,
        lastDiff.index,
      );
      assert.deepStrictEqual(classDiff, lastDiff);
    });

    // Verifies that the caching mechanism in HeapSnapshotManager correctly
    // distinguishes comparisons when the same "current" snapshot is compared
    // against different "base" snapshots. If the cache key (diffCacheKey) is
    // not unique per base snapshot, the second comparison might incorrectly
    // return cached results from the first comparison.
    it('compares the same current snapshot against different bases', async () => {
      const firstDiff = await manager.getClassDiffs(filePathA, filePathC);
      const secondDiff = await manager.getClassDiffs(filePathB, filePathC);
      const firstNewObjectDiff = firstDiff.classDiffs.find(
        entry => entry.className === 'NewObject',
      );
      const secondNewObjectDiff = secondDiff.classDiffs.find(
        entry => entry.className === 'NewObject',
      );
      assert.ok(firstNewObjectDiff);
      assert.ok(secondNewObjectDiff);
      assert.equal(firstNewObjectDiff.addedCount, 7);
      assert.equal(secondNewObjectDiff.addedCount, 5);
    });

    it('throws when getDetailedClassDiff is called with an invalid classIndex', async () => {
      await assert.rejects(
        manager.getDetailedClassDiff(filePathA, filePathB, 99),
        /Invalid classIndex: 99. Total classes with changes: 10/,
      );
    });
  });

  describe('with example fixture', () => {
    const filePath = 'tests/fixtures/example.heapsnapshot';
    let manager: HeapSnapshotManager;

    before(() => {
      manager = new HeapSnapshotManager();
    });

    after(() => {
      manager.dispose();
    });

    it('throws when getNodesById is called with a non-existent class ID', async () => {
      await manager.getAggregates(filePath);

      await assert.rejects(manager.getNodesById(filePath, 999999), {
        message: 'Class with ID 999999 not found in heap snapshot',
      });
    });

    it('resolves class IDs in getNodesById without calling getAggregates first', async () => {
      const freshManager = new HeapSnapshotManager();
      try {
        const {aggregates} = await manager.getAggregates(filePath);
        const functionAggregate = aggregates.find(
          a => a.className === 'Function',
        );
        assert.ok(functionAggregate);
        const classId = functionAggregate.id;

        const expectedNodes = await manager.getNodesById(filePath, classId);
        const nodesWithoutPriorAggregates = await freshManager.getNodesById(
          filePath,
          classId,
        );

        assert.ok(nodesWithoutPriorAggregates.items.length > 0);
        assert.deepStrictEqual(
          nodesWithoutPriorAggregates.items,
          expectedNodes.items,
        );
      } finally {
        freshManager.dispose();
      }
    });

    it('assigns deterministic class IDs even when getAggregates is called with a filter first', async () => {
      const filteredFirstManager = new HeapSnapshotManager();
      try {
        const unfilteredFirst = await manager.getAggregates(filePath);
        const unfilteredById = new Map(
          unfilteredFirst.aggregates.map(a => [a.id, a.className]),
        );

        const filteredFirst = await filteredFirstManager.getAggregates(
          filePath,
          'sharedNativeContext',
        );
        const unfilteredSecond =
          await filteredFirstManager.getAggregates(filePath);

        for (const aggregate of filteredFirst.aggregates) {
          assert.strictEqual(
            aggregate.className,
            unfilteredById.get(aggregate.id),
          );
        }

        assert.deepStrictEqual(
          unfilteredSecond.aggregates,
          unfilteredFirst.aggregates,
        );
      } finally {
        filteredFirstManager.dispose();
      }
    });
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
      assert.strictEqual(await manager.disposeSnapshot(filePath), true);
      assert.strictEqual(await manager.disposeSnapshot(filePath), false);
      assert.strictEqual(manager.hasSnapshots(), false);
    } finally {
      manager.dispose();
    }
  });
});
