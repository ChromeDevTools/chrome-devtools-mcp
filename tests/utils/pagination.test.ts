/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {paginate} from '../../src/utils/pagination.js';

function getItems(count: number): string[] {
  return Array.from({length: count}, (_, idx) => `item-${idx}`);
}

describe('paginate', () => {
  describe('without pagination options', () => {
    it('should return all items when options are omitted', () => {
      const items = getItems(3);
      const result = paginate(items);
      assert.strictEqual(result.items, items);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.totalPages, 1);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.hasPreviousPage, false);
      assert.strictEqual(result.startIndex, 0);
      assert.strictEqual(result.endIndex, 3);
      assert.strictEqual(result.invalidPage, false);
    });

    it('should return all items when options are empty', () => {
      const items = getItems(50);
      const result = paginate(items, {});
      assert.strictEqual(result.items, items);
      assert.strictEqual(result.totalPages, 1);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.endIndex, 50);
    });

    it('should handle an empty list', () => {
      const result = paginate([]);
      assert.deepStrictEqual(result.items, []);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.totalPages, 1);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.hasPreviousPage, false);
      assert.strictEqual(result.startIndex, 0);
      assert.strictEqual(result.endIndex, 0);
      assert.strictEqual(result.invalidPage, false);
    });
  });

  describe('with pagination options', () => {
    it('should handle an empty list', () => {
      const result = paginate([], {pageSize: 5, pageIdx: 0});
      assert.deepStrictEqual(result.items, []);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.totalPages, 1);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.hasPreviousPage, false);
      assert.strictEqual(result.startIndex, 0);
      assert.strictEqual(result.endIndex, 0);
      assert.strictEqual(result.invalidPage, false);
    });

    it('should handle a single item', () => {
      const result = paginate(['only'], {pageSize: 5});
      assert.deepStrictEqual(result.items, ['only']);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.totalPages, 1);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.hasPreviousPage, false);
      assert.strictEqual(result.startIndex, 0);
      assert.strictEqual(result.endIndex, 1);
    });

    it('should return a single page when pageSize exceeds the total', () => {
      const items = getItems(3);
      const result = paginate(items, {pageSize: 10, pageIdx: 0});
      assert.deepStrictEqual(result.items, items);
      assert.strictEqual(result.totalPages, 1);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.hasPreviousPage, false);
      assert.strictEqual(result.startIndex, 0);
      assert.strictEqual(result.endIndex, 3);
    });

    it('should return the first page by default when pageIdx is omitted', () => {
      const result = paginate(getItems(10), {pageSize: 4});
      assert.deepStrictEqual(result.items, [
        'item-0',
        'item-1',
        'item-2',
        'item-3',
      ]);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.totalPages, 3);
      assert.strictEqual(result.hasNextPage, true);
      assert.strictEqual(result.hasPreviousPage, false);
      assert.strictEqual(result.invalidPage, false);
    });

    it('should default pageSize to 20 when only pageIdx is provided', () => {
      const result = paginate(getItems(25), {pageIdx: 1});
      assert.deepStrictEqual(result.items, [
        'item-20',
        'item-21',
        'item-22',
        'item-23',
        'item-24',
      ]);
      assert.strictEqual(result.currentPage, 1);
      assert.strictEqual(result.totalPages, 2);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.hasPreviousPage, true);
      assert.strictEqual(result.startIndex, 20);
      assert.strictEqual(result.endIndex, 25);
    });

    it('should report a middle page with both neighbors', () => {
      const result = paginate(getItems(12), {pageSize: 5, pageIdx: 1});
      assert.deepStrictEqual(result.items, [
        'item-5',
        'item-6',
        'item-7',
        'item-8',
        'item-9',
      ]);
      assert.strictEqual(result.currentPage, 1);
      assert.strictEqual(result.totalPages, 3);
      assert.strictEqual(result.hasNextPage, true);
      assert.strictEqual(result.hasPreviousPage, true);
      assert.strictEqual(result.startIndex, 5);
      assert.strictEqual(result.endIndex, 10);
    });

    it('should partially fill the last page', () => {
      const result = paginate(getItems(12), {pageSize: 5, pageIdx: 2});
      assert.deepStrictEqual(result.items, ['item-10', 'item-11']);
      assert.strictEqual(result.currentPage, 2);
      assert.strictEqual(result.totalPages, 3);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.hasPreviousPage, true);
      assert.strictEqual(result.startIndex, 10);
      assert.strictEqual(result.endIndex, 12);
    });

    it('should not create an empty trailing page when the total is an exact multiple of pageSize', () => {
      const result = paginate(getItems(10), {pageSize: 5, pageIdx: 1});
      assert.deepStrictEqual(result.items, [
        'item-5',
        'item-6',
        'item-7',
        'item-8',
        'item-9',
      ]);
      assert.strictEqual(result.currentPage, 1);
      assert.strictEqual(result.totalPages, 2);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.hasPreviousPage, true);
      assert.strictEqual(result.startIndex, 5);
      assert.strictEqual(result.endIndex, 10);
    });
  });

  describe('invalid page indexes', () => {
    it('should fall back to the first page when pageIdx is beyond the last page', () => {
      const result = paginate(getItems(10), {pageSize: 5, pageIdx: 2});
      assert.deepStrictEqual(result.items, [
        'item-0',
        'item-1',
        'item-2',
        'item-3',
        'item-4',
      ]);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.totalPages, 2);
      assert.strictEqual(result.invalidPage, true);
    });

    it('should fall back to the first page when pageIdx is negative', () => {
      const result = paginate(getItems(10), {pageSize: 5, pageIdx: -1});
      assert.deepStrictEqual(result.items, [
        'item-0',
        'item-1',
        'item-2',
        'item-3',
        'item-4',
      ]);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.invalidPage, true);
    });

    it('should treat pageIdx 0 as valid for an empty list', () => {
      const result = paginate([], {pageSize: 5, pageIdx: 0});
      assert.strictEqual(result.invalidPage, false);
    });

    it('should flag pageIdx beyond range for an empty list', () => {
      const result = paginate([], {pageSize: 5, pageIdx: 1});
      assert.deepStrictEqual(result.items, []);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.invalidPage, true);
    });
  });

  describe('unusual pageSize values', () => {
    // Tool schemas in `console.ts` and `network.ts` reject non-positive
    // pageSize values, but the plain `zod.number()` schemas in `memory.ts`
    // let them through. These tests document the current behavior.
    it('should return no items for pageSize 0', () => {
      const result = paginate(getItems(3), {pageSize: 0});
      assert.deepStrictEqual(result.items, []);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.totalPages, Infinity);
      assert.strictEqual(result.hasNextPage, true);
      assert.strictEqual(result.endIndex, 0);
    });

    it('should slice from the end for a negative pageSize', () => {
      const result = paginate(getItems(10), {pageSize: -5});
      // `items.slice(0, -5)` keeps everything but the last five items.
      assert.deepStrictEqual(result.items, [
        'item-0',
        'item-1',
        'item-2',
        'item-3',
        'item-4',
      ]);
      assert.strictEqual(result.currentPage, 0);
      assert.strictEqual(result.totalPages, 1);
      assert.strictEqual(result.hasNextPage, false);
      assert.strictEqual(result.endIndex, 5);
    });
  });
});
