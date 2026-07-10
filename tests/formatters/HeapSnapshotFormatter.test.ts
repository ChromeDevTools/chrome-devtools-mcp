/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {HeapSnapshotFormatter} from '../../src/formatters/HeapSnapshotFormatter.js';
import {DevTools} from '../../src/third_party/index.js';
import {stableIdSymbol} from '../../src/utils/id.js';

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
          selfSize: DevTools.I18n.ByteUtilities.formatBytesToKb(100),
          retainedSize: DevTools.I18n.ByteUtilities.formatBytesToKb(1000),
        },
        {
          id: 2,
          className: 'ObjectB',
          count: 5,
          selfSize: DevTools.I18n.ByteUtilities.formatBytesToKb(50),
          retainedSize: DevTools.I18n.ByteUtilities.formatBytesToKb(500),
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
        'name,type,nodeId,nodeName',
        'edge1,property,1,NodeA',
        'edge2,element,2,NodeB',
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
        `0,Balanced,1,1,0,${DevTools.I18n.ByteUtilities.formatBytesToKb(100)},${DevTools.I18n.ByteUtilities.formatBytesToKb(100)},${DevTools.I18n.ByteUtilities.formatBytesToKb(0)}`,
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
      const formatted120 = DevTools.I18n.ByteUtilities.formatBytesToKb(120);
      const formatted60 = DevTools.I18n.ByteUtilities.formatBytesToKb(60);

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
        `10,ClassA,${DevTools.I18n.ByteUtilities.formatBytesToKb(100)},${DevTools.I18n.ByteUtilities.formatBytesToKb(1000)}`,
        `20,ClassB,${DevTools.I18n.ByteUtilities.formatBytesToKb(50)},${DevTools.I18n.ByteUtilities.formatBytesToKb(500)}`,
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
        `20,system / NativeContext / https://example.com,${DevTools.I18n.ByteUtilities.formatBytesToKb(200)},${DevTools.I18n.ByteUtilities.formatBytesToKb(5000)},${DevTools.I18n.ByteUtilities.formatBytesToKb(2000)}`,
        `10,system / NativeContext,${DevTools.I18n.ByteUtilities.formatBytesToKb(100)},${DevTools.I18n.ByteUtilities.formatBytesToKb(1000)},${DevTools.I18n.ByteUtilities.formatBytesToKb(500)}`,
        `Shared Size: ${DevTools.I18n.ByteUtilities.formatBytesToKb(300)}`,
        `Unattributed Size: ${DevTools.I18n.ByteUtilities.formatBytesToKb(400)}`,
      ].join('\n');

      assert.strictEqual(result, expected);
    });
  });
});
