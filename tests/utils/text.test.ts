/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {truncateText, truncateUrl} from '../../src/utils/text.js';

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

  it('moves the cut back before a surrogate pair that straddles the limit', () => {
    const text = 'ab' + EMOJI + 'cd';
    assert.strictEqual(truncateText(text, 3), 'ab...');
    assert.strictEqual(truncateText(text, 4), 'ab' + EMOJI + '...');
    // The result must survive a strict JSON round-trip without a lone escape.
    assert.doesNotMatch(JSON.stringify(truncateText(text, 3)), /\\ud83d/i);
  });

  it('counts the limit in UTF-16 code units', () => {
    // 4 graphemes but 5 code units: over a limit of 4.
    assert.strictEqual(
      truncateText('ab' + EMOJI + 'c', 4),
      'ab' + EMOJI + '...',
    );
    assert.strictEqual(truncateText('ab' + EMOJI + 'c', 5), 'ab' + EMOJI + 'c');
  });

  it('bounds the output for text made of long grapheme clusters', () => {
    const text = FAMILY.repeat(20000);
    const result = truncateText(text, 10000);
    assert.ok(result.length <= 10000 + '...'.length, String(result.length));
    assert.ok(result.endsWith('...'));
    assert.strictEqual(result.slice(0, -3).length % FAMILY.length, 0);
  });

  it('does not break a joined emoji sequence', () => {
    const text = 'a' + FAMILY + 'b';
    // FAMILY is 11 code units long.
    assert.strictEqual(truncateText(text, 12), 'a' + FAMILY + '...');
    assert.strictEqual(truncateText(text, 11), 'a...');
    assert.strictEqual(truncateText(text, 1), 'a...');
  });

  it('returns only the ellipsis for a zero limit', () => {
    assert.strictEqual(truncateText('abc', 0), '...');
  });
});

describe('truncateUrl', () => {
  it('returns a URL within 255 characters unchanged', () => {
    const url = 'https://example.com/' + 'a'.repeat(235);
    assert.strictEqual(truncateUrl(url), url);
  });

  it('cuts a long data URL at 255 characters', () => {
    const url = 'data:image/png;base64,' + 'A'.repeat(5000);
    assert.strictEqual(truncateUrl(url), url.slice(0, 255) + '... <truncated>');
  });
});
