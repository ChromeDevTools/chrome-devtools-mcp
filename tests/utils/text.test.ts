/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {truncateText} from '../../src/utils/text.js';

const EMOJI = '\u{1F600}';
// Family emoji: four code points joined with zero-width joiners.
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';

describe('truncateText', () => {
  it('returns text within the limit unchanged', () => {
    assert.strictEqual(truncateText('abc', 3), 'abc');
    assert.strictEqual(truncateText('abc', 10), 'abc');
  });

  it('cuts plain text at the limit and appends the ellipsis', () => {
    assert.strictEqual(truncateText('abcdef', 4), 'abcd...');
    assert.strictEqual(
      truncateText('abcdef', 4, {ellipsis: '... <truncated>'}),
      'abcd... <truncated>',
    );
  });

  it('counts the ellipsis toward the limit when asked', () => {
    assert.strictEqual(
      truncateText('abcdefgh', 6, {includeEllipsisInLength: true}),
      'abc...',
    );
    assert.strictEqual(
      truncateText('abcdef', 6, {includeEllipsisInLength: true}),
      'abcdef',
    );
  });

  it('keeps a surrogate pair whole at the cut', () => {
    const text = 'ab' + EMOJI + 'cd';
    assert.strictEqual(truncateText(text, 3), 'ab' + EMOJI + '...');
    // The result must survive a strict JSON round-trip without a lone escape.
    assert.doesNotMatch(JSON.stringify(truncateText(text, 3)), /\\ud83d/i);
  });

  it('counts an emoji as one character', () => {
    // 4 code points, 5 code units, 4 graphemes: within the limit.
    assert.strictEqual(truncateText('ab' + EMOJI + 'c', 4), 'ab' + EMOJI + 'c');
  });

  it('does not break a joined emoji sequence', () => {
    const text = 'a' + FAMILY + 'b';
    assert.strictEqual(truncateText(text, 2), 'a' + FAMILY + '...');
    assert.strictEqual(truncateText(text, 1), 'a...');
  });

  it('returns only the ellipsis for a zero limit', () => {
    assert.strictEqual(truncateText('abc', 0), '...');
  });
});
