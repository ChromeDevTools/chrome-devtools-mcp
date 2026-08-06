/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {createIdGenerator, stableIdSymbol} from '../../src/utils/id.js';

describe('createIdGenerator', () => {
  it('produces sequential integers starting at 1', () => {
    const gen = createIdGenerator();
    assert.strictEqual(gen(), 1);
    assert.strictEqual(gen(), 2);
    assert.strictEqual(gen(), 3);
  });
});

describe('stableIdSymbol', () => {
  it('is a symbol and can be used as a property key', () => {
    const obj: Record<symbol, number> = {} as Record<symbol, number>;
    obj[stableIdSymbol] = 42;
    assert.strictEqual(obj[stableIdSymbol], 42);
  });
});
