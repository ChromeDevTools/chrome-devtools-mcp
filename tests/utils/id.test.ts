/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {WithSymbolId} from '../../src/utils/id.js';
import {createIdGenerator, stableIdSymbol} from '../../src/utils/id.js';

describe('createIdGenerator', () => {
  it('should return 1 as the first id', () => {
    const generate = createIdGenerator();
    assert.strictEqual(generate(), 1);
  });

  it('should return sequentially incrementing ids', () => {
    const generate = createIdGenerator();
    assert.strictEqual(generate(), 1);
    assert.strictEqual(generate(), 2);
    assert.strictEqual(generate(), 3);
    assert.strictEqual(generate(), 4);
  });

  it('should not share state between independent generators', () => {
    const first = createIdGenerator();
    const second = createIdGenerator();

    assert.strictEqual(first(), 1);
    assert.strictEqual(first(), 2);
    assert.strictEqual(second(), 1);
    assert.strictEqual(first(), 3);
    assert.strictEqual(second(), 2);
  });

  it('should assign ids retrievable via stableIdSymbol', () => {
    const generate = createIdGenerator();
    const resource: WithSymbolId<{url: string}> = {url: 'http://example.com'};
    resource[stableIdSymbol] = generate();

    assert.strictEqual(resource[stableIdSymbol], 1);
    // The symbol-keyed id must not show up during regular enumeration.
    assert.deepStrictEqual(Object.keys(resource), ['url']);
  });
});
