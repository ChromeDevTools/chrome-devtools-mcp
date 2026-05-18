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
      t.assert.snapshot?.(result);
    });
  });

  describe('toJSON', () => {
    it('returns structured data sorted by retained size', () => {
      const formatter = new HeapSnapshotFormatter(mockAggregates);
      const result = formatter.toJSON();
      assert.deepStrictEqual(result, [
        {
          uid: 1,
          className: 'ObjectA',
          count: 10,
          selfSize: DevTools.I18n.ByteUtilities.formatBytesToKb(100),
          retainedSize: DevTools.I18n.ByteUtilities.formatBytesToKb(1000),
        },
        {
          uid: 2,
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
        'edgeIndex,edgeName,edgeType,targetNodeId,targetNodeName',
        '0,edge1,property,1,NodeA',
        '1,edge2,element,2,NodeB',
      ].join('\n');

      assert.strictEqual(result, expected);
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
});
