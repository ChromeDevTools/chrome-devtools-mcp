/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/bin/brave-devtools-mcp-cli-options.js';
import {serializeArgs} from '../../src/daemon/utils.js';
import type {YargsOptions} from '../../src/third_party/index.js';

describe('serializeArgs', () => {
  it('should ignore undefined or null values', () => {
    const options: Record<string, YargsOptions> = {
      foo: {},
      bar: {},
      baz: {},
    };
    const argv = {
      foo: undefined,
      bar: null,
      baz: 'value',
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, ['--baz', 'value']);
  });

  it('should handle boolean values', () => {
    const options: Record<string, YargsOptions> = {foo: {}, bar: {}};
    const argv = {
      foo: true,
      bar: false,
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, ['--foo', '--no-bar']);
  });

  it('should handle array values', () => {
    const options: Record<string, YargsOptions> = {foo: {}};
    const argv = {
      foo: ['val1', 'val2'],
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, ['--foo', 'val1', '--foo', 'val2']);
  });

  it('should handle primitive values', () => {
    const options: Record<string, YargsOptions> = {foo: {}, bar: {}};
    const argv = {
      foo: 'string',
      bar: 42,
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, ['--foo', 'string', '--bar', '42']);
  });

  it('should convert camelCase keys to kebab-case', () => {
    const options: Record<string, YargsOptions> = {
      camelCaseKey: {},
      anotherKey: {},
    };
    const argv = {
      camelCaseKey: 'value1',
      anotherKey: true,
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, [
      '--camel-case-key',
      'value1',
      '--another-key',
    ]);
  });
});
