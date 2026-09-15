/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseKey} from '../../src/utils/keyboard.js';

describe('parseKey', () => {
  it('parses single keys', () => {
    assert.deepStrictEqual(parseKey('Enter'), ['Enter']);
    assert.deepStrictEqual(parseKey('Escape'), ['Escape']);
    assert.deepStrictEqual(parseKey('F5'), ['F5']);
    assert.deepStrictEqual(parseKey('5'), ['5']);
    assert.deepStrictEqual(parseKey('Numpad5'), ['Numpad5']);
    assert.deepStrictEqual(parseKey('KeyA'), ['KeyA']);
    assert.deepStrictEqual(parseKey('a'), ['a']);
    assert.deepStrictEqual(parseKey('A'), ['A']);
    assert.deepStrictEqual(parseKey(' '), [' ']);
    assert.deepStrictEqual(parseKey('\r'), ['\r']);
    assert.deepStrictEqual(parseKey('\n'), ['\n']);
  });

  it('parses a modifier on its own', () => {
    assert.deepStrictEqual(parseKey('Shift'), ['Shift']);
    assert.deepStrictEqual(parseKey('Control'), ['Control']);
    assert.deepStrictEqual(parseKey('Meta'), ['Meta']);
  });

  it('returns the primary key first, then modifiers in original order', () => {
    assert.deepStrictEqual(parseKey('Shift+Enter'), ['Enter', 'Shift']);
    assert.deepStrictEqual(parseKey('Shift+A'), ['A', 'Shift']);
    assert.deepStrictEqual(parseKey('Control+Shift+P'), [
      'P',
      'Control',
      'Shift',
    ]);
    assert.deepStrictEqual(parseKey('Control+Alt+Delete'), [
      'Delete',
      'Control',
      'Alt',
    ]);
    assert.deepStrictEqual(parseKey('Alt+Control+Delete'), [
      'Delete',
      'Alt',
      'Control',
    ]);
    assert.deepStrictEqual(parseKey('Control+Shift'), ['Shift', 'Control']);
  });

  it('parses a literal plus as a key', () => {
    assert.deepStrictEqual(parseKey('+'), ['+']);
    assert.deepStrictEqual(parseKey('Shift++'), ['+', 'Shift']);
    assert.deepStrictEqual(parseKey('Control+Shift++'), [
      '+',
      'Control',
      'Shift',
    ]);
  });

  it('ignores a trailing separator', () => {
    assert.deepStrictEqual(parseKey('Shift+'), ['Shift']);
    assert.deepStrictEqual(parseKey('++'), ['+']);
  });

  it('is case-sensitive', () => {
    assert.deepStrictEqual(parseKey('Shift+a'), ['a', 'Shift']);
    assert.deepStrictEqual(parseKey('Shift+A'), ['A', 'Shift']);
    assert.throws(
      () => {
        parseKey('shift+a');
      },
      {message: /^shift is invalid\. Valid keys are: /},
    );
    assert.throws(
      () => {
        parseKey('ENTER');
      },
      {message: /^ENTER is invalid\. Valid keys are: /},
    );
  });

  it('does not trim whitespace around keys', () => {
    assert.throws(
      () => {
        parseKey('Shift + a');
      },
      {message: /is invalid\. Valid keys are: /},
    );
    assert.throws(
      () => {
        parseKey('Enter ');
      },
      {message: /is invalid\. Valid keys are: /},
    );
  });

  it('throws on invalid key names with a helpful message', () => {
    assert.throws(
      () => {
        parseKey('aaaaa');
      },
      {message: /^aaaaa is invalid\. Valid keys are: /},
    );
    assert.throws(
      () => {
        parseKey('NotAKey+Enter');
      },
      {message: /^NotAKey is invalid\. Valid keys are: /},
    );
    assert.throws(
      () => {
        parseKey('+a');
      },
      {message: /^\+a is invalid\. Valid keys are: /},
    );
  });

  it('throws on empty input', () => {
    assert.throws(
      () => {
        parseKey('');
      },
      {message: 'Key  could not be parsed.'},
    );
  });

  it('throws on duplicate keys', () => {
    assert.throws(
      () => {
        parseKey('Shift+Shift');
      },
      {message: 'Key Shift+Shift contains duplicate keys.'},
    );
    assert.throws(
      () => {
        parseKey('Control+a+Control');
      },
      {message: 'Key Control+a+Control contains duplicate keys.'},
    );
    assert.throws(
      () => {
        parseKey('a+a');
      },
      {message: 'Key a+a contains duplicate keys.'},
    );
  });
});
