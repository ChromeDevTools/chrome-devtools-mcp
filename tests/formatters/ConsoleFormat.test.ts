/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  formatConsoleTemplate,
  hasConsoleFormatSpecifier,
} from '../../src/formatters/ConsoleFormat.js';

describe('ConsoleFormat', () => {
  it('detects console format specifiers and ANSI sequences', () => {
    assert.strictEqual(hasConsoleFormatSpecifier('%cHello'), true);
    assert.strictEqual(hasConsoleFormatSpecifier('100%%'), true);
    assert.strictEqual(hasConsoleFormatSpecifier('\x1B[31mred\x1B[0m'), true);
    assert.strictEqual(hasConsoleFormatSpecifier('100% done'), false);
    assert.strictEqual(hasConsoleFormatSpecifier('plain text'), false);
  });

  it('strips %c style specifiers and consumed CSS arguments', () => {
    const result = formatConsoleTemplate(
      '%c %c %c %c %c Phaser v3.90.0 (WebGL | Web Audio) %c https://phaser.io/v390',
      [
        {type: 'string', value: 'background: #ff0000'},
        {type: 'string', value: 'background: #ffff00'},
        {type: 'string', value: 'background: #00ff00'},
        {type: 'string', value: 'background: #00ffff'},
        {type: 'string', value: 'color: #ffffff; background: #000000'},
        {type: 'string', value: 'background: transparent'},
      ],
    );

    assert.strictEqual(
      result.text,
      '     Phaser v3.90.0 (WebGL | Web Audio)  https://phaser.io/v390',
    );
    assert.deepStrictEqual(result.unusedArgs, []);
  });

  it('substitutes %s, %d, %i, %f, %o, %O, %_, and %%', () => {
    const result = formatConsoleTemplate(
      '100%% %s: int=%d trunc=%i float=%f obj=%o generic=%O hidden=%_',
      [
        {type: 'string', value: 'ok'},
        {type: 'number', value: 42.9},
        {type: 'number', value: 7.8},
        {type: 'number', value: 3.14},
        {
          type: 'object',
          description: 'Object',
          preview: {
            type: 'object',
            description: 'Object',
            overflow: false,
            properties: [{name: 'a', type: 'number', value: '1'}],
          },
        },
        {type: 'object', description: 'Map(0)'},
        {type: 'string', value: 'ignored'},
      ],
    );

    assert.strictEqual(
      result.text,
      '100% ok: int=42 trunc=7 float=3.14 obj={a: 1} generic=Map(0) hidden=',
    );
    assert.deepStrictEqual(result.unusedArgs, []);
  });

  it('strips ANSI SGR escape sequences', () => {
    const result = formatConsoleTemplate('\x1B[31merror\x1B[0m: %s', [
      {type: 'string', value: 'failed'},
    ]);
    assert.strictEqual(result.text, 'error: failed');
  });

  it('appends unused arguments and preserves unmatched specifiers', () => {
    const extraResult = formatConsoleTemplate('hello %s', [
      {type: 'string', value: 'world'},
      {type: 'number', value: 99},
    ]);
    assert.strictEqual(extraResult.text, 'hello world 99');
    assert.strictEqual(extraResult.unusedArgs.length, 1);

    const missingResult = formatConsoleTemplate('hello %s %d', [
      {type: 'string', value: 'world'},
    ]);
    assert.strictEqual(missingResult.text, 'hello world %d');
    assert.deepStrictEqual(missingResult.unusedArgs, []);
  });

  it('formats non-numeric arguments for %d and %f as NaN', () => {
    const result = formatConsoleTemplate('%d %f', [
      {type: 'string', value: 'not-a-number'},
      {type: 'boolean', value: true},
    ]);
    assert.strictEqual(result.text, 'NaN NaN');
  });
});
