/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {paginate} from '../../src/utils/pagination.js';

describe('paginate', () => {
  it('returns all items when no pagination options are provided', () => {
    const items = Array.from({length: 25}, (_, i) => `item-${i}`);
    const result = paginate(items);
    assert.strictEqual(result.items.length, 25);
    assert.strictEqual(result.currentPage, 0);
    assert.strictEqual(result.totalPages, 1);
    assert.strictEqual(result.hasNextPage, false);
    assert.strictEqual(result.hasPreviousPage, false);
    assert.strictEqual(result.invalidPage, false);
  });

  it('uses default page size of 20 when pageIdx is provided without pageSize', () => {
    const items = Array.from({length: 25}, (_, i) => `item-${i}`);
    const result = paginate(items, {pageIdx: 1});
    assert.strictEqual(result.items.length, 5);
    assert.strictEqual(result.items[0], 'item-20');
    assert.strictEqual(result.currentPage, 1);
    assert.strictEqual(result.totalPages, 2);
    assert.strictEqual(result.hasNextPage, false);
    assert.strictEqual(result.hasPreviousPage, true);
    assert.strictEqual(result.invalidPage, false);
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
