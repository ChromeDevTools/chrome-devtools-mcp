/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseJsonFile} from '../../src/utils/json.js';

describe('parseJsonFile', () => {
  it('parses JSON', () => {
    assert.deepStrictEqual(parseJsonFile('{"a":[1,2]}'), {a: [1, 2]});
  });

  it('ignores a leading UTF-8 byte order mark', () => {
    assert.deepStrictEqual(parseJsonFile('\uFEFF{"a":1}'), {a: 1});
  });

  it('keeps the parser error when no message is given', () => {
    assert.throws(() => parseJsonFile('not json'), SyntaxError);
  });

  it('replaces the parser error with the given message', () => {
    assert.throws(
      () => parseJsonFile('SECRET_VALUE invalid', 'File is not valid JSON.'),
      error => {
        assert.ok(error instanceof Error);
        assert.strictEqual(error.message, 'File is not valid JSON.');
        assert.ok(!(error instanceof SyntaxError));
        assert.strictEqual(error.cause, undefined);
        return true;
      },
    );
  });
});
