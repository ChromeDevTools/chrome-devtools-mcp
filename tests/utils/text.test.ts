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

  it('truncates a URL whose length equals the limit plus suffix length', () => {
    const url = 'https://example.com/' + 'a'.repeat(250);
    assert.strictEqual(url.length, 270);
    assert.strictEqual(truncateUrl(url), url.slice(0, 255) + '... <truncated>');
  });

  it('does not leave a partial ASCII percent escape at the cut', () => {
    const suffix = '... <truncated>';
    // Place %2F straddling index 255 at both partial offsets (% and %2).
    for (const pad of [231, 230]) {
      const base = 'https://example.com/?q=' + 'a'.repeat(pad);
      const result = truncateUrl(base + '%2F' + 'b'.repeat(20));
      assert.strictEqual(result, base + suffix);
    }
    // Keep %2F intact when it ends right on the 255-character boundary.
    const exactBase = 'https://example.com/?q=' + 'a'.repeat(229);
    assert.strictEqual(
      truncateUrl(exactBase + '%2F' + 'b'.repeat(20)),
      exactBase + '%2F' + suffix,
    );
  });

  it('does not split a multi-byte UTF-8 percent-encoded character', () => {
    const suffix = '... <truncated>';
    // 2-byte (é), 3-byte (須), and 4-byte (😀) UTF-8 percent-encoded chars.
    const encodedChars = ['%C3%A9', '%E9%A0%88', '%F0%9F%98%80'];
    for (const encoded of encodedChars) {
      for (let kept = 1; kept < encoded.length; kept++) {
        const prefix = 'https://example.com/?q=' + 'a'.repeat(255 - 23 - kept);
        const result = truncateUrl(prefix + encoded + 'z'.repeat(20));
        assert.strictEqual(result, prefix + suffix);
        assert.doesNotThrow(() => decodeURI(result.slice(0, -suffix.length)));
      }
      // Keep the encoded character when all of its bytes fit within 255 chars.
      const exactPrefix =
        'https://example.com/?q=' + 'a'.repeat(255 - 23 - encoded.length);
      const exactResult = truncateUrl(exactPrefix + encoded + 'z'.repeat(20));
      assert.strictEqual(exactResult, exactPrefix + encoded + suffix);
      assert.doesNotThrow(() =>
        decodeURI(exactResult.slice(0, -suffix.length)),
      );
    }
  });

  it('does not trim a literal percent that is not part of a valid escape', () => {
    const base = 'https://example.com/?q=' + 'a'.repeat(231) + '%';
    assert.strictEqual(base.length, 255);
    assert.strictEqual(
      truncateUrl(base + 'hello_world'),
      base + '... <truncated>',
    );
  });
});
