/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {paginate} from '../../src/utils/pagination.js';

describe('paginate', () => {
  it('returns all items when pageSize is omitted with pageIdx: 0', () => {
    const items = Array.from({length: 25}, (_, i) => `item-${i}`);
    const result = paginate(items, {pageIdx: 0});
    assert.strictEqual(result.items.length, 25);
    assert.strictEqual(result.currentPage, 0);
    assert.strictEqual(result.totalPages, 1);
    assert.strictEqual(result.hasNextPage, false);
    assert.strictEqual(result.hasPreviousPage, false);
    assert.strictEqual(result.invalidPage, false);
  });

  it('marks page invalid and returns all items on first page when pageIdx > 0 and pageSize is omitted', () => {
    const items = Array.from({length: 25}, (_, i) => `item-${i}`);
    const result = paginate(items, {pageIdx: 1});
    assert.strictEqual(result.items.length, 25);
    assert.strictEqual(result.currentPage, 0);
    assert.strictEqual(result.totalPages, 1);
    assert.strictEqual(result.invalidPage, true);
  });

  it('paginates normally when pageSize is provided', () => {
    const items = Array.from({length: 25}, (_, i) => `item-${i}`);
    const result = paginate(items, {pageSize: 10, pageIdx: 1});
    assert.strictEqual(result.items.length, 10);
    assert.strictEqual(result.items[0], 'item-10');
    assert.strictEqual(result.currentPage, 1);
    assert.strictEqual(result.totalPages, 3);
    assert.strictEqual(result.hasNextPage, true);
    assert.strictEqual(result.hasPreviousPage, true);
    assert.strictEqual(result.invalidPage, false);
  });
});
