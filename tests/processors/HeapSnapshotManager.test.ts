/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {HeapSnapshotManager} from '../../src/processors/HeapSnapshotManager.js';
import {DevTools} from '../../src/third_party/index.js';
import {stableIdSymbol} from '../../src/utils/id.js';
import {createTempDir} from '../utils.js';

async function createDetachedDomSnapshotFixture(
  filePath: string,
): Promise<void> {
  const fixture = JSON.parse(
    await fs.readFile('tests/fixtures/example.heapsnapshot', 'utf8'),
  );
  const fields = fixture.snapshot.meta.node_fields;
  const typeOffset = fields.indexOf('type');
  const nameOffset = fields.indexOf('name');
  const nodeTypes = fixture.snapshot.meta.node_types[typeOffset];
  let targetOffset = -1;

  for (let offset = 0; offset < fixture.nodes.length; offset += fields.length) {
    const nodeType = nodeTypes[fixture.nodes[offset + typeOffset]];
    const nodeName = fixture.strings[fixture.nodes[offset + nameOffset]];
    if (nodeType === 'native' && nodeName === '<div>') {
      targetOffset = offset;
      break;
    }
  }

  assert.notEqual(targetOffset, -1);
  fixture.strings.push('Detached <div class="detached-node">');
  fixture.nodes[targetOffset + nameOffset] = fixture.strings.length - 1;

  await fs.writeFile(filePath, JSON.stringify(fixture));
}

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

  it('resolves class IDs in getNodesById without calling getAggregates first', async () => {
    const manager1 = new HeapSnapshotManager();
    const manager2 = new HeapSnapshotManager();
    try {
      const filePath = 'tests/fixtures/example.heapsnapshot';
      const {aggregates} = await manager1.getAggregates(filePath);
      const functionAggregate = Object.values(aggregates).find(
        a => a.name === 'Function',
      );
      assert.ok(functionAggregate);
      const classId = functionAggregate[stableIdSymbol];
      assert.ok(classId !== undefined);

      const expectedNodes = await manager1.getNodesById(filePath, classId);
      const nodesWithoutPriorAggregates = await manager2.getNodesById(
        filePath,
        classId,
      );

      assert.ok(nodesWithoutPriorAggregates.items.length > 0);
      assert.deepStrictEqual(
        nodesWithoutPriorAggregates.items,
        expectedNodes.items,
      );
    } finally {
      manager1.dispose();
      manager2.dispose();
    }
  });

  it('queries nodes by aggregate class names', async () => {
    const manager = new HeapSnapshotManager();
    try {
      const filePath = 'tests/fixtures/example.heapsnapshot';
      const {aggregates} = await manager.getAggregates(filePath);
      const nativeClass = Object.values(aggregates).find(
        aggregate => aggregate.name === 'HTMLBodyElement',
      );
      const specialClass = Object.values(aggregates).find(
        aggregate => aggregate.name === '(array)',
      );
      assert.ok(nativeClass);
      assert.ok(specialClass);

      const nativeClassId = nativeClass[stableIdSymbol];
      const specialClassId = specialClass[stableIdSymbol];
      assert.ok(nativeClassId !== undefined);
      assert.ok(specialClassId !== undefined);

      const expectedNativeNodes = await manager.getNodesById(
        filePath,
        nativeClassId,
      );
      const actualNativeNodes = await manager.queryObjects(filePath, {
        className: 'HTMLBodyElement',
      });
      const actualEmptyTypeNodes = await manager.queryObjects(filePath, {
        className: 'HTMLBodyElement',
        nodeType: '',
      });
      assert.deepStrictEqual(
        actualNativeNodes.items
          .map(node => {
            assert.ok('id' in node);
            return node.id;
          })
          .sort(),
        expectedNativeNodes.items
          .map(node => {
            assert.ok('id' in node);
            return node.id;
          })
          .sort(),
      );
      const expectedNativeOrder = expectedNativeNodes.items
        .filter(node => 'id' in node)
        .toSorted(
          (a, b) =>
            b.retainedSize - a.retainedSize || a.nodeIndex - b.nodeIndex,
        )
        .map(node => node.id);
      assert.deepStrictEqual(
        actualNativeNodes.items.map(node => {
          assert.ok('id' in node);
          return node.id;
        }),
        expectedNativeOrder,
      );
      assert.deepStrictEqual(
        actualEmptyTypeNodes.items.map(node => {
          assert.ok('id' in node);
          return node.id;
        }),
        actualNativeNodes.items.map(node => {
          assert.ok('id' in node);
          return node.id;
        }),
      );
      const actualAnchoredNativeNodes = await manager.queryObjects(filePath, {
        className: '^HTMLBodyElement$',
      });
      assert.deepStrictEqual(
        actualAnchoredNativeNodes.items
          .map(node => {
            assert.ok('id' in node);
            return node.id;
          })
          .sort(),
        expectedNativeNodes.items
          .map(node => {
            assert.ok('id' in node);
            return node.id;
          })
          .sort(),
      );

      const expectedSpecialNodes = await manager.getNodesById(
        filePath,
        specialClassId,
      );
      const matchingSpecialNode = expectedSpecialNodes.items.find(
        (node): node is DevTools.HeapSnapshotModel.HeapSnapshotModel.Node =>
          'id' in node && node.type === 'array',
      );
      assert.ok(matchingSpecialNode);
      const actualSpecialNodes = await manager.queryObjects(filePath, {
        className: '(array)',
        nodeType: 'array',
        sortBy: 'id',
        minSelfSize: matchingSpecialNode.selfSize,
        maxSelfSize: matchingSpecialNode.selfSize,
      });
      const expectedSpecialIds = expectedSpecialNodes.items
        .filter(
          node =>
            'id' in node &&
            node.type === 'array' &&
            node.selfSize === matchingSpecialNode.selfSize,
        )
        .map(node => {
          assert.ok('id' in node);
          return node.id;
        });
      const actualSpecialIds = actualSpecialNodes.items.map(node => {
        assert.ok('id' in node);
        return node.id;
      });
      assert.deepStrictEqual(
        actualSpecialIds,
        expectedSpecialIds.sort((a, b) => a - b),
      );

      const queriedSpecialNodes = await manager.queryObjects(filePath, {
        propertyName: '.+',
      });
      const actualSpecialPropertyNodes = await manager.queryObjects(filePath, {
        className: '(array)',
        propertyName: '.+',
      });
      const expectedSpecialNodeIds = new Set(
        expectedSpecialNodes.items.map(node => {
          assert.ok('id' in node);
          return node.id;
        }),
      );
      const queriedSpecialIds = queriedSpecialNodes.items
        .filter(
          (node): node is DevTools.HeapSnapshotModel.HeapSnapshotModel.Node =>
            'id' in node && expectedSpecialNodeIds.has(node.id),
        )
        .map(node => node.id);
      assert.deepStrictEqual(
        actualSpecialPropertyNodes.items.map(node => {
          assert.ok('id' in node);
          return node.id;
        }),
        queriedSpecialIds,
      );
    } finally {
      manager.dispose();
    }
  });

  it('matches detached DOM class names instead of node display names', async () => {
    using directory = createTempDir('heap-snapshot-class-filter-');
    const filePath = path.join(directory.path, 'detached.heapsnapshot');
    await createDetachedDomSnapshotFixture(filePath);
    const manager = new HeapSnapshotManager();
    try {
      const {aggregates} = await manager.getAggregates(filePath);
      const detachedClass = Object.values(aggregates).find(
        aggregate => aggregate.name === 'Detached <div>',
      );
      assert.ok(detachedClass);

      const classId = detachedClass[stableIdSymbol];
      assert.ok(classId !== undefined);
      const expectedNodes = await manager.getNodesById(filePath, classId);
      const actualNodes = await manager.queryObjects(filePath, {
        className: 'Detached <div>',
        isDetached: false,
      });
      const expectedIds = expectedNodes.items.map(node => {
        assert.ok('id' in node);
        return node.id;
      });
      const actualIds = actualNodes.items.map(node => {
        assert.ok('id' in node);
        return node.id;
      });

      assert.deepStrictEqual(actualIds, expectedIds);
      assert.equal(
        actualNodes.items[0]?.name,
        'Detached <div class="detached-node">',
      );
    } finally {
      manager.dispose();
    }
  });

  it('assigns deterministic class IDs even when getAggregates is called with a filter first', async () => {
    const unfilteredFirstManager = new HeapSnapshotManager();
    const filteredFirstManager = new HeapSnapshotManager();
    try {
      const filePath = 'tests/fixtures/example.heapsnapshot';
      const unfilteredFirst =
        await unfilteredFirstManager.getAggregates(filePath);

      const filteredFirst = await filteredFirstManager.getAggregates(
        filePath,
        'sharedNativeContext',
      );
      const unfilteredSecond =
        await filteredFirstManager.getAggregates(filePath);

      for (const [key, aggregate] of Object.entries(filteredFirst.aggregates)) {
        assert.strictEqual(
          aggregate[stableIdSymbol],
          unfilteredFirst.aggregates[key]?.[stableIdSymbol],
        );
      }

      for (const [key, aggregate] of Object.entries(
        unfilteredSecond.aggregates,
      )) {
        assert.strictEqual(
          aggregate[stableIdSymbol],
          unfilteredFirst.aggregates[key]?.[stableIdSymbol],
        );
      }
    } finally {
      unfilteredFirstManager.dispose();
      filteredFirstManager.dispose();
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
