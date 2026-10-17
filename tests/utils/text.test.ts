/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {sliceWithoutSplittingSurrogates} from '../../src/utils/text.js';

const EMOJI = '\u{1F600}';

describe('sliceWithoutSplittingSurrogates', () => {
  it('returns text within the limit unchanged', () => {
    assert.strictEqual(sliceWithoutSplittingSurrogates('abc', 3), 'abc');
    assert.strictEqual(sliceWithoutSplittingSurrogates('abc', 10), 'abc');
  });

  it('cuts plain text at the limit', () => {
    assert.strictEqual(sliceWithoutSplittingSurrogates('abcdef', 4), 'abcd');
  });

  it('drops the whole pair when the cut would land inside it', () => {
    const text = 'ab' + EMOJI + 'cd';
    assert.strictEqual(sliceWithoutSplittingSurrogates(text, 3), 'ab');
    // The result must survive a strict JSON round-trip without a lone escape.
    assert.doesNotMatch(
      JSON.stringify(sliceWithoutSplittingSurrogates(text, 3)),
      /\\ud83d/i,
    );
  });

  it('keeps a pair that ends exactly at the limit', () => {
    const text = 'ab' + EMOJI + 'cd';
    assert.strictEqual(sliceWithoutSplittingSurrogates(text, 4), 'ab' + EMOJI);
  });

  it('treats a non-positive limit as zero', () => {
    assert.strictEqual(sliceWithoutSplittingSurrogates('abc', 0), '');
    assert.strictEqual(sliceWithoutSplittingSurrogates('abc', -2), '');
  });
});
