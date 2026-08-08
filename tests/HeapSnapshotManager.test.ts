/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {join} from 'node:path';
import {describe, it, after, afterEach} from 'node:test';

import sinon from 'sinon';

import {HeapSnapshotManager} from '../src/HeapSnapshotManager.js';
import {DevTools} from '../src/third_party/index.js';
import {stableIdSymbol} from '../src/utils/id.js';

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

  describe('with the example fixture', () => {
    const fixturePath = join(
      process.cwd(),
      'tests/fixtures/example.heapsnapshot',
    );
    const manager = new HeapSnapshotManager();

    after(() => {
      manager.dispose();
    });

    it('caches snapshots by resolved path', async () => {
      const first = await manager.getSnapshot(fixturePath);
      const second = await manager.getSnapshot(fixturePath);
      const viaRelativePath = await manager.getSnapshot(
        'tests/fixtures/example.heapsnapshot',
      );

      assert.strictEqual(second, first);
      assert.strictEqual(viaRelativePath, first);
    });

    it('aggregates classes with totals and stable ids', async () => {
      const data = await manager.getAggregates(fixturePath);
      const aggregates = Object.values(data.aggregates);
      assert.ok(aggregates.length > 0);

      let objectCount = 0;
      let totalSelfSize = 0;
      const ids = new Set<number>();
      for (const aggregate of aggregates) {
        objectCount += aggregate.count;
        totalSelfSize += aggregate.self;
        const id = aggregate[stableIdSymbol];
        assert.ok(typeof id === 'number' && id > 0);
        ids.add(id);
      }

      assert.ok(data.objectCount > 0);
      assert.ok(data.totalSelfSize > 0);
      assert.strictEqual(data.objectCount, objectCount);
      assert.strictEqual(data.totalSelfSize, totalSelfSize);
      // Every class gets a distinct id.
      assert.strictEqual(ids.size, aggregates.length);

      const arrayAggregate = aggregates.find(
        aggregate => aggregate.name === 'Array',
      );
      assert.ok(arrayAggregate);
      assert.strictEqual(arrayAggregate.count, 8);
    });

    it('returns stable class ids that resolve back to class keys', async () => {
      const first = await manager.getAggregates(fixturePath);
      const second = await manager.getAggregates(fixturePath);

      for (const [classKey, aggregate] of Object.entries(first.aggregates)) {
        const id = aggregate[stableIdSymbol];
        assert.ok(id);
        const other = second.aggregates[classKey];
        assert.ok(other);
        assert.strictEqual(other[stableIdSymbol], id);
        assert.strictEqual(
          await manager.resolveClassKeyFromId(fixturePath, id),
          classKey,
        );
        assert.strictEqual(
          await manager.getOrCreateIdForClassKey(fixturePath, classKey),
          id,
        );
      }
    });

    it('applies the objectsRetainedByContexts filter', async () => {
      const unfiltered = await manager.getAggregates(fixturePath);
      const filtered = await manager.getAggregates(
        fixturePath,
        'objectsRetainedByContexts',
      );

      assert.ok(filtered.objectCount > 0);
      assert.ok(filtered.objectCount < unfiltered.objectCount);
      assert.ok(
        Object.values(filtered.aggregates).some(
          aggregate => aggregate.name === 'Function',
        ),
      );
    });

    it('rejects attributedToSpecificNativeContext without an objectId', async () => {
      await assert.rejects(
        manager.getAggregates(fixturePath, 'attributedToSpecificNativeContext'),
        {
          message:
            'objectId is required when filterName is attributedToSpecificNativeContext',
        },
      );
    });

    it('reports snapshot statistics', async () => {
      const stats = await manager.getStats(fixturePath);

      assert.strictEqual(stats.total, 1121496);
      assert.strictEqual(stats.native.total + stats.v8heap.total, stats.total);
      for (const value of [
        stats.native.typedArrays,
        stats.v8heap.code,
        stats.v8heap.jsArrays,
        stats.v8heap.strings,
        stats.v8heap.system,
      ]) {
        assert.ok(typeof value === 'number' && value >= 0);
      }
    });

    it('exposes static data once the snapshot is loaded', async () => {
      const staticData = await manager.getStaticData(fixturePath);
      assert.ok(staticData);
      assert.strictEqual(staticData.nodeCount, 27466);
      assert.strictEqual(staticData.rootNodeIndex, 0);
      assert.strictEqual(staticData.maxJSObjectId, 54005);

      const stats = await manager.getStats(fixturePath);
      assert.strictEqual(staticData.totalSize, stats.total);
    });

    it('computes native context sizes', async () => {
      const sizes = await manager.getNativeContextSizes(fixturePath);

      assert.strictEqual(sizes.nativeContexts.length, 4);
      for (const nativeContext of sizes.nativeContexts) {
        assert.ok(nativeContext.nodeName.startsWith('system / NativeContext'));
        assert.ok(nativeContext.selfSize > 0);
        assert.ok(nativeContext.retainedSize > 0);
        assert.ok(nativeContext.attributedSize > 0);
      }
      assert.ok(
        sizes.nativeContexts.some(
          nativeContext => nativeContext.nodeId === 7249,
        ),
      );
      assert.ok(sizes.sharedSize > 0);
      assert.ok(sizes.noAttributionSize > 0);
    });
  });

  describe('snapshot lifecycle', () => {
    it('tracks and disposes loaded snapshots', async () => {
      const manager = new HeapSnapshotManager();
      const fixturePath = join(
        process.cwd(),
        'tests/fixtures/heap-1.heapsnapshot',
      );
      try {
        assert.strictEqual(manager.hasSnapshots(), false);

        await manager.getSnapshot(fixturePath);
        assert.strictEqual(manager.hasSnapshots(), true);

        // disposeSnapshot resolves relative paths like getSnapshot does.
        assert.strictEqual(
          manager.disposeSnapshot('tests/fixtures/heap-1.heapsnapshot'),
          true,
        );
        assert.strictEqual(manager.hasSnapshots(), false);
        assert.strictEqual(manager.disposeSnapshot(fixturePath), false);
      } finally {
        manager.dispose();
      }
    });

    it('rejects class key lookups for snapshots that are not loaded', async () => {
      const manager = new HeapSnapshotManager();
      await assert.rejects(
        manager.getOrCreateIdForClassKey(
          '/nonexistent/missing.heapsnapshot',
          'Foo',
        ),
        /Snapshot not loaded/,
      );
    });
  });
});
