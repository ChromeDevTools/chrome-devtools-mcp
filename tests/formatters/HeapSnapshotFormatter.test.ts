/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {HeapSnapshotFormatter} from '../../src/formatters/HeapSnapshotFormatter.js';
import type {DevTools} from '../../src/third_party/index.js';
import {stableIdSymbol} from '../../src/utils/id.js';

describe('HeapSnapshotFormatter', () => {
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
          selfSize: 100,
          retainedSize: 1000,
        },
        {
          uid: 2,
          className: 'ObjectB',
          count: 5,
          selfSize: 50,
          retainedSize: 500,
        },
      ]);
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
