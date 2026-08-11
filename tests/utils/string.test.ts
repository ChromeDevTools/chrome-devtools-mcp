/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {toSnakeCase} from '../../src/utils/string.js';

describe('toSnakeCase', () => {
  it('should convert camelCase to snake_case', () => {
    assert.strictEqual(toSnakeCase('lastName'), 'last_name');
    assert.strictEqual(toSnakeCase('browserUrl'), 'browser_url');
    assert.strictEqual(
      toSnakeCase('acceptInsecureCerts'),
      'accept_insecure_certs',
    );
  });

  it('should convert PascalCase to snake_case', () => {
    assert.strictEqual(toSnakeCase('LastName'), 'last_name');
    assert.strictEqual(toSnakeCase('XMLHttpRequest'), 'xml_http_request');
  });

  it('should handle acronym runs', () => {
    assert.strictEqual(toSnakeCase('APIFlags'), 'api_flags');
    assert.strictEqual(toSnakeCase('HTMLParser'), 'html_parser');
    assert.strictEqual(toSnakeCase('parseHTML'), 'parse_html');
    assert.strictEqual(toSnakeCase('fooBAR'), 'foo_bar');
    assert.strictEqual(toSnakeCase('ABC'), 'abc');
  });

  it('should insert underscores at letter-to-digit transitions', () => {
    assert.strictEqual(toSnakeCase('version2'), 'version_2');
    assert.strictEqual(toSnakeCase('v2'), 'v_2');
    assert.strictEqual(toSnakeCase('myVar123Name'), 'my_var_123_name');
    assert.strictEqual(toSnakeCase('getHTTP2Response'), 'get_http_2_response');
  });

  it('should not insert underscores at digit-to-lowercase transitions', () => {
    assert.strictEqual(toSnakeCase('2fast'), '2fast');
    assert.strictEqual(toSnakeCase('a1B2c3'), 'a_1_b_2c_3');
  });

  it('should keep already snake_case input unchanged', () => {
    assert.strictEqual(toSnakeCase('already_snake'), 'already_snake');
    assert.strictEqual(toSnakeCase('snake_case_2'), 'snake_case_2');
  });

  it('should collapse non-alphanumeric sequences into a single underscore', () => {
    assert.strictEqual(toSnakeCase('foo-bar baz'), 'foo_bar_baz');
    assert.strictEqual(toSnakeCase('foo.bar/baz'), 'foo_bar_baz');
  });

  it('should strip leading and trailing underscores', () => {
    assert.strictEqual(toSnakeCase('__leading__'), 'leading');
    assert.strictEqual(toSnakeCase('  spaced  '), 'spaced');
  });

  it('should handle non-ASCII letters', () => {
    assert.strictEqual(toSnakeCase('снегУпал'), 'снег_упал');
  });

  it('should return an empty string for an empty string', () => {
    assert.strictEqual(toSnakeCase(''), '');
  });

  it('should lowercase a single character', () => {
    assert.strictEqual(toSnakeCase('A'), 'a');
    assert.strictEqual(toSnakeCase('a'), 'a');
  });
});
