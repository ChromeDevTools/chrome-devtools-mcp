/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {join} from 'node:path';
import {describe, it, before, after} from 'node:test';

import {HeapSnapshotFormatter} from '../../src/formatters/HeapSnapshotFormatter.js';
import {HeapSnapshotManager} from '../../src/processors/HeapSnapshotManager.js';
import {DevTools} from '../../src/third_party/index.js';
import {parseByteSizeRange} from '../../src/utils/bytes.js';
import {stableIdSymbol} from '../../src/utils/id.js';

const {formatBytesToKb} = DevTools.I18n.ByteUtilities;

describe('HeapSnapshotFormatter', () => {
  DevTools.I18n.DevToolsLocale.DevToolsLocale.instance({
    create: true,
    data: {
      navigatorLanguage: 'en-US',
      settingLanguage: 'en-US',
      lookupClosestDevToolsLocale: l => l,
    },
  });
  DevTools.I18n.i18n.registerLocaleDataForTest('en-US', {});
  const mockAggregates: Record<
    string,
    DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
  > = {
    ObjectA: {
      name: 'ObjectA',
      count: 10,
      self: 100,
      maxRet: 1000,
      distance: 1,
      idxs: [],
      [stableIdSymbol]: 1,
    } as unknown as DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo,
    ObjectB: {
      name: 'ObjectB',
      count: 5,
      self: 50,
      maxRet: 500,
      distance: 2,
      idxs: [],
      [stableIdSymbol]: 2,
    } as unknown as DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo,
  };

  describe('toString', () => {
    it('formats data as CSV and sorts by retained size', t => {
      const formatter = new HeapSnapshotFormatter(mockAggregates);
      const result = formatter.toString();
      t.assert.snapshot(result);
    });
  });

  describe('toJSON', () => {
    it('returns structured data sorted by retained size', () => {
      const formatter = new HeapSnapshotFormatter(mockAggregates);
      const result = formatter.toJSON();
      assert.deepStrictEqual(result, [
        {
          id: 1,
          className: 'ObjectA',
          count: 10,
          selfSize: formatBytesToKb(100),
          retainedSize: formatBytesToKb(1000),
        },
        {
          id: 2,
          className: 'ObjectB',
          count: 5,
          selfSize: formatBytesToKb(50),
          retainedSize: formatBytesToKb(500),
        },
      ]);
    });
  });

  describe('formatNodes', () => {
    it('formats edges correctly', () => {
      const mockEdges = [
        {
          name: 'edge1',
          type: 'property',
          edgeIndex: 0,
          isAddedNotRemoved: null,
          node: {
            id: 1,
            name: 'NodeA',
            distance: 0,
            nodeIndex: 0,
            retainedSize: 0,
            selfSize: 0,
            type: 'object',
            canBeQueried: false,
            detachedDOMTreeNode: false,
            ignored: false,
            isAddedNotRemoved: null,
          },
        },
        {
          name: 'edge2',
          type: 'element',
          edgeIndex: 1,
          isAddedNotRemoved: null,
          node: {
            id: 2,
            name: 'NodeB',
            distance: 0,
            nodeIndex: 0,
            retainedSize: 0,
            selfSize: 0,
            type: 'object',
            canBeQueried: false,
            detachedDOMTreeNode: false,
            ignored: false,
            isAddedNotRemoved: null,
          },
        },
      ];

      const result = HeapSnapshotFormatter.formatNodes(mockEdges);
      const expected = [
        'name,type,nodeId,nodeName,selfSize,retainedSize',
        'edge1,property,1,NodeA,0.0 kB,0.0 kB',
        'edge2,element,2,NodeB,0.0 kB,0.0 kB',
      ].join('\n');

      assert.strictEqual(result, expected);
    });
  });

  describe('formatDiffSummary', () => {
    it('includes classes with balanced added and removed objects', () => {
      const summarized = [
        {
          className: 'Balanced',
          addedCount: 1,
          removedCount: 1,
          countDelta: 0,
          addedSize: 100,
          removedSize: 100,
          sizeDelta: 0,
        },
      ];
      const result = HeapSnapshotFormatter.formatDiffSummary(summarized);
      const expected = [
        'index,className,addedCount,removedCount,countDelta,addedSize,removedSize,sizeDelta',
        `0,Balanced,1,1,0,${formatBytesToKb(100)},${formatBytesToKb(100)},${formatBytesToKb(0)}`,
      ].join('\n');

      assert.strictEqual(result, expected);

      const summarizedJson = JSON.stringify(summarized);
      assert.ok(summarizedJson);
      assert.equal(summarizedJson.includes('addedIndexes'), false);
      assert.equal(summarizedJson.includes('deletedIndexes'), false);
    });
  });

  describe('formatDiffDetails', () => {
    it('formats detailed diffs correctly', () => {
      const details = {
        className: 'MyClass',
        addedCount: 2,
        removedCount: 1,
        countDelta: 1,
        addedSize: 120,
        removedSize: 60,
        sizeDelta: 60,
        addedIds: [101, 102],
        addedSelfSizes: [60, 60],
        deletedIds: [201],
        deletedSelfSizes: [60],
      };

      const formatted = HeapSnapshotFormatter.formatDiffDetails(details);
      const formatted120 = formatBytesToKb(120);
      const formatted60 = formatBytesToKb(60);

      const expected = [
        `MyClass: # new: 2, # deleted: 1, # delta: +1, alloc size: +${formatted120}, freed size: +${formatted60}, size delta: +${formatted60}`,
        'Objects:',
        `  + @101 (self_size: ${formatted60})`,
        `  + @102 (self_size: ${formatted60})`,
        `  - @201 (self_size: ${formatted60})`,
      ].join('\n');

      assert.strictEqual(formatted, expected);
    });
  });

  describe('sort', () => {
    it('sorts aggregates by retained size descending', () => {
      const unsortedAggregates: Record<
        string,
        DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
      > = {
        ObjectB: {
          name: 'ObjectB',
          self: 50,
          maxRet: 500,
        },
        ObjectA: {
          name: 'ObjectA',
          self: 100,
          maxRet: 1000,
        },
      } as unknown as Record<
        string,
        DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
      >;

      const result = HeapSnapshotFormatter.sort(unsortedAggregates);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0][0], 'ObjectA');
      assert.strictEqual(result[1][0], 'ObjectB');
    });
  });

  describe('formatRetainingPaths', () => {
    it('formats retaining paths correctly', () => {
      const mockRetainingPaths = [
        {
          edgeIndex: 0,
          edgeName: 'foo',
          edgeType: 'property',
          nodeId: 10,
          nodeIndex: 1,
          nodeName: 'ClassA',
          distance: 2,
          children: [
            {
              edgeIndex: 0,
              edgeName: 'bar',
              edgeType: 'element',
              nodeId: 20,
              nodeIndex: 2,
              nodeName: 'ClassB',
              distance: 1,
              children: [],
            },
          ],
        },
      ] as unknown as DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingEdge[];

      const result =
        HeapSnapshotFormatter.formatRetainingPaths(mockRetainingPaths);
      const expected = [
        '<- @10 ClassA via property foo (distance: 2)',
        '  <- @20 ClassB via element bar (distance: 1)',
      ].join('\n');

      assert.strictEqual(result, expected);
    });
  });

  describe('formatDominators', () => {
    it('formats dominator chain correctly', () => {
      const mockDominators: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain =
        [
          {
            nodeId: 10,
            nodeIndex: 1,
            nodeName: 'ClassA',
            retainedSize: 1000,
            selfSize: 100,
          },
          {
            nodeId: 20,
            nodeIndex: 2,
            nodeName: 'ClassB',
            retainedSize: 500,
            selfSize: 50,
          },
        ];

      const result = HeapSnapshotFormatter.formatDominators(mockDominators);
      const expected = [
        'nodeId,nodeName,selfSize,retainedSize',
        `10,ClassA,${formatBytesToKb(100)},${formatBytesToKb(1000)}`,
        `20,ClassB,${formatBytesToKb(50)},${formatBytesToKb(500)}`,
      ].join('\n');

      assert.strictEqual(result, expected);
    });

    it('formats empty dominator chain correctly', () => {
      const mockDominators: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain =
        [];
      const result = HeapSnapshotFormatter.formatDominators(mockDominators);
      const expected = 'nodeId,nodeName,selfSize,retainedSize';
      assert.strictEqual(result, expected);
    });
  });

  describe('formatNativeContextSizes', () => {
    it('formats native context sizes as CSV with summary lines', () => {
      const mockSizes: DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes =
        {
          nativeContexts: [
            {
              nodeId: 10,
              nodeIndex: 1,
              nodeName: 'system / NativeContext',
              attributedSize: 500,
              retainedSize: 1000,
              selfSize: 100,
            },
            {
              nodeId: 20,
              nodeIndex: 2,
              nodeName: 'system / NativeContext / https://example.com',
              attributedSize: 2000,
              retainedSize: 5000,
              selfSize: 200,
            },
          ],
          sharedSize: 300,
          noAttributionSize: 400,
        };

      const result = HeapSnapshotFormatter.formatNativeContextSizes(mockSizes);
      const expected = [
        'nodeId,nodeName,selfSize,retainedSize,attributedSize',
        `20,system / NativeContext / https://example.com,${formatBytesToKb(200)},${formatBytesToKb(5000)},${formatBytesToKb(2000)}`,
        `10,system / NativeContext,${formatBytesToKb(100)},${formatBytesToKb(1000)},${formatBytesToKb(500)}`,
        `Shared Size: ${formatBytesToKb(300)}`,
        `Unattributed Size: ${formatBytesToKb(400)}`,
      ].join('\n');

      assert.strictEqual(result, expected);
    });
  });

  describe('formatRetainedByContextSummary', () => {
    it('formats retained by context summary correctly', () => {
      const mockSummary = {
        contextCount: 2,
        retainedByContextSize: 5000,
        retainedByContextCount: 10,
        notRetainedByContextSize: 1000,
        notRetainedByContextCount: 5,
        totalSize: 6000,
      };

      const result =
        HeapSnapshotFormatter.formatRetainedByContextSummary(mockSummary);
      const expected = [
        'Context count: 2',
        `Retained by context size: ${formatBytesToKb(5000)} (10 objects)`,
        `Not retained by context size: ${formatBytesToKb(1000)} (5 objects)`,
        `Total size: ${formatBytesToKb(6000)}`,
      ].join('\n');

      assert.strictEqual(result, expected);
    });
  });

  describe('with real fixtures', () => {
    let manager: HeapSnapshotManager;
    const examplePath = join(
      process.cwd(),
      'tests/fixtures/example.heapsnapshot',
    );
    const heap1Path = join(process.cwd(), 'tests/fixtures/heap-1.heapsnapshot');
    const heap2Path = join(process.cwd(), 'tests/fixtures/heap-2.heapsnapshot');
    const heap3Path = join(process.cwd(), 'tests/fixtures/heap-3.heapsnapshot');

    before(() => {
      manager = new HeapSnapshotManager();
    });

    after(() => {
      manager.dispose();
    });

    describe('toString with aggregates', () => {
      it('formats aggregates with default options', async t => {
        const data = await manager.getAggregates(examplePath);
        const formatter = new HeapSnapshotFormatter(data.aggregates);
        t.assert.snapshot(formatter.toString());
      });

      it('formats aggregates with objectsRetainedByContexts filterName', async t => {
        const data = await manager.getAggregates(
          examplePath,
          'objectsRetainedByContexts',
        );
        const formatter = new HeapSnapshotFormatter(data.aggregates);
        t.assert.snapshot(formatter.toString());
      });

      it('formats aggregates with sharedNativeContext filterName', async t => {
        const data = await manager.getAggregates(
          examplePath,
          'sharedNativeContext',
        );
        const formatter = new HeapSnapshotFormatter(data.aggregates);
        t.assert.snapshot(formatter.toString());
      });

      it('formats aggregates with attributedToSpecificNativeContext filterName and objectId', async t => {
        const data = await manager.getAggregates(
          examplePath,
          'attributedToSpecificNativeContext',
          7249,
        );
        const formatter = new HeapSnapshotFormatter(data.aggregates);
        t.assert.snapshot(formatter.toString());
      });
    });

    describe('formatNativeContextSizes', () => {
      it('formats native context sizes from fixture', async t => {
        const sizes = await manager.getNativeContextSizes(examplePath);
        t.assert.snapshot(
          HeapSnapshotFormatter.formatNativeContextSizes(sizes),
        );
      });
    });

    describe('formatRetainedByContextSummary', () => {
      it('formats retained by context summary from fixture', async t => {
        const summary = await manager.getRetainedByContextSummary(examplePath);
        t.assert.snapshot(
          HeapSnapshotFormatter.formatRetainedByContextSummary(summary),
        );
      });
    });

    describe('formatNodes with class nodes', () => {
      it('formats class nodes with default options', async t => {
        await manager.getAggregates(examplePath);
        const nodes = await manager.getNodesById(examplePath, 19);
        t.assert.snapshot(HeapSnapshotFormatter.formatNodes(nodes.items));
      });

      it('formats class nodes with objectsRetainedByContexts filterName', async t => {
        const aggregateData = await manager.getAggregates(
          examplePath,
          'objectsRetainedByContexts',
        );
        const aggregate = Object.values(aggregateData.aggregates).find(
          a => a.name === 'Function',
        );
        assert.ok(aggregate);
        const id = aggregate[stableIdSymbol];
        if (id === undefined) {
          assert.fail('Expected class ID to be defined');
        }
        const nodes = await manager.getNodesById(
          examplePath,
          id,
          'objectsRetainedByContexts',
        );
        t.assert.snapshot(HeapSnapshotFormatter.formatNodes(nodes.items));
      });
    });

    describe('formatNodes with retainers', () => {
      it('formats retainers for a valid nodeId', async t => {
        const retainers = await manager.getRetainers(examplePath, 25341);
        t.assert.snapshot(HeapSnapshotFormatter.formatNodes(retainers.items));
      });
    });

    describe('formatObjectInfo', () => {
      it('formats object details for a valid nodeId', async t => {
        const objectInfo = await manager.getObjectInfo(examplePath, 25341);
        t.assert.snapshot(HeapSnapshotFormatter.formatObjectInfo(objectInfo));
      });
    });

    describe('formatRetainingPaths', () => {
      it('formats retaining paths for a valid nodeId', async t => {
        const retainingPaths = await manager.getRetainingPaths(
          examplePath,
          45901,
        );
        t.assert.snapshot(
          HeapSnapshotFormatter.formatRetainingPaths(retainingPaths.paths),
        );
      });

      it('reports when limits are reached', async () => {
        const retainingPaths = await manager.getRetainingPaths(
          examplePath,
          45901,
          1,
        );
        assert.strictEqual(retainingPaths.paths.length, 0);
        assert.strictEqual(retainingPaths.limitsReached.depth, true);
      });
    });

    describe('formatNodes with edges', () => {
      it('formats outgoing edges for a valid nodeId', async t => {
        const edges = await manager.getEdges(examplePath, 25341);
        t.assert.snapshot(HeapSnapshotFormatter.formatNodes(edges.items));
      });

      it('formats outgoing edges with pagination', async t => {
        const edges = await manager.getEdges(examplePath, 25341);
        t.assert.snapshot(
          HeapSnapshotFormatter.formatNodes(edges.items.slice(0, 2)),
        );
      });

      it('formats outgoing edges with retainedSize range', async t => {
        const range = parseByteSizeRange('100B-100B');
        const edges = await manager.getEdges(examplePath, 25341, {
          minRetainedSize: range?.min,
        });
        t.assert.snapshot(HeapSnapshotFormatter.formatNodes(edges.items));
      });
    });

    describe('formatDominators', () => {
      it('formats dominator chain for a valid nodeId', async t => {
        const dominators = await manager.getDominatorsOf(examplePath, 25341);
        t.assert.snapshot(HeapSnapshotFormatter.formatDominators(dominators));
      });
    });

    describe('formatDiffSummary and formatDiffDetails', () => {
      it('formats diff summary comparing heap-1 to heap-2', async t => {
        const diffs = await manager.getClassDiffs(heap1Path, heap2Path);
        t.assert.snapshot(HeapSnapshotFormatter.formatDiffSummary(diffs));
      });

      it('formats diff summary comparing heap-2 to heap-3', async t => {
        const diffs = await manager.getClassDiffs(heap2Path, heap3Path);
        t.assert.snapshot(HeapSnapshotFormatter.formatDiffSummary(diffs));
      });

      it('formats detailed diff comparing heap-1 to heap-2 with classIndex filter', async t => {
        const detailedDiff = await manager.getDetailedClassDiff(
          heap1Path,
          heap2Path,
          2,
        );
        t.assert.snapshot(
          HeapSnapshotFormatter.formatDiffDetails(detailedDiff),
        );
      });
    });

    describe('formatDuplicateStrings', () => {
      it('formats duplicate strings with default options', async t => {
        const duplicateStrings = await manager.getDuplicateStrings(examplePath);
        t.assert.snapshot(
          HeapSnapshotFormatter.formatDuplicateStrings(duplicateStrings),
        );
      });
    });

    describe('formatNodes with queryObjects', () => {
      it('formats queried objects with default options', async t => {
        const objects = await manager.queryObjects(examplePath, {});
        t.assert.snapshot(
          HeapSnapshotFormatter.formatNodes(objects.items.slice(0, 10)),
        );
      });

      it('formats queried objects with className filter', async t => {
        const objects = await manager.queryObjects(examplePath, {
          className: 'Window',
        });
        t.assert.snapshot(
          HeapSnapshotFormatter.formatNodes(objects.items.slice(0, 10)),
        );
      });

      it('formats queried objects with an unbounded retainedSize filter', async t => {
        const range = parseByteSizeRange('1KB');
        const objects = await manager.queryObjects(examplePath, {
          minRetainedSize: range?.min,
        });
        t.assert.snapshot(
          HeapSnapshotFormatter.formatNodes(objects.items.slice(0, 10)),
        );
      });

      it('formats queried objects with sortBy selfSize and pagination', async t => {
        const objects = await manager.queryObjects(examplePath, {
          sortBy: 'selfSize',
        });
        t.assert.snapshot(
          HeapSnapshotFormatter.formatNodes(objects.items.slice(0, 5)),
        );
      });
    });
  });
});
