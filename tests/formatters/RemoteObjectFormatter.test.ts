/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {formatRemoteObject} from '../../src/formatters/RemoteObjectFormatter.js';
import type {Protocol} from '../../src/third_party/index.js';

function preview(
  subtype: Protocol.Runtime.ObjectPreview['subtype'],
  description: string,
  properties: Protocol.Runtime.PropertyPreview[],
  {
    overflow = false,
    entries,
  }: {overflow?: boolean; entries?: Protocol.Runtime.EntryPreview[]} = {},
): Protocol.Runtime.RemoteObject {
  return {
    type: 'object',
    subtype,
    description,
    preview: {
      type: 'object',
      subtype,
      description,
      overflow,
      properties,
      entries,
    },
  };
}

describe('formatRemoteObject', () => {
  it('formats Map and Set entries', () => {
    const number = (value: string): Protocol.Runtime.ObjectPreview => ({
      type: 'number',
      description: value,
      overflow: false,
      properties: [],
    });
    const map = preview(
      'map',
      'Map(1)',
      [{name: 'size', type: 'number', value: '1'}],
      {
        entries: [
          {
            key: number('1'),
            value: {
              type: 'object',
              description: 'Object',
              overflow: false,
              properties: [{name: 'a', type: 'number', value: '2'}],
            },
          },
        ],
      },
    );
    assert.strictEqual(formatRemoteObject(map), 'Map(1) {1 => {…}}');

    const set = preview(
      'set',
      'Set(2)',
      [{name: 'size', type: 'number', value: '2'}],
      {
        entries: [
          {value: number('3')},
          {
            value: {
              type: 'string',
              description: 'x',
              overflow: false,
              properties: [],
            },
          },
        ],
      },
    );
    assert.strictEqual(formatRemoteObject(set), "Set(2) {3, 'x'}");
  });

  it('formats objects without following cycles', () => {
    assert.strictEqual(
      formatRemoteObject(
        preview(undefined, 'Object', [
          {name: 'name', type: 'string', value: 'cyc'},
          {name: 'self', type: 'object', value: 'Object'},
          {name: 'fn', type: 'function', value: ''},
        ]),
      ),
      "{name: 'cyc', self: {…}, fn: ƒ}",
    );
  });

  it('formats arrays with holes and overflow', () => {
    assert.strictEqual(
      formatRemoteObject(
        preview('array', 'Array(3)', [
          {name: '0', type: 'number', value: '1'},
          {name: '2', type: 'number', value: '3'},
        ]),
      ),
      '(3) [1, empty, 3]',
    );
    assert.strictEqual(
      formatRemoteObject(
        preview(
          'array',
          'Array(120)',
          [
            {name: '0', type: 'number', value: '0'},
            {name: '1', type: 'number', value: '1'},
          ],
          {overflow: true},
        ),
      ),
      '(120) [0, 1, …]',
    );
    assert.strictEqual(
      formatRemoteObject(
        preview('typedarray', 'Uint8Array(2)', [
          {name: '0', type: 'number', value: '1'},
          {name: '1', type: 'number', value: '2'},
        ]),
      ),
      'Uint8Array(2) [1, 2]',
    );
  });

  it('formats promise state', () => {
    assert.strictEqual(
      formatRemoteObject(
        preview('promise', 'Promise', [
          {name: '[[PromiseState]]', type: 'string', value: 'fulfilled'},
          {name: '[[PromiseResult]]', type: 'number', value: '5'},
        ]),
      ),
      'Promise {<fulfilled>: 5}',
    );
  });

  it('uses the description for values without a property preview', () => {
    assert.strictEqual(
      formatRemoteObject(
        preview('date', 'Thu Jan 01 1970 00:00:00 GMT+0000', []),
      ),
      'Thu Jan 01 1970 00:00:00 GMT+0000',
    );
    assert.strictEqual(
      formatRemoteObject(preview('node', 'body', [], {overflow: true})),
      'body',
    );
    assert.strictEqual(
      formatRemoteObject({
        type: 'function',
        className: 'Function',
        description: 'function foo(){ return 1; }',
      }),
      'function foo(){ return 1; }',
    );
    assert.strictEqual(
      formatRemoteObject({type: 'symbol', description: 'Symbol(s)'}),
      'Symbol(s)',
    );
    assert.strictEqual(
      formatRemoteObject({
        type: 'bigint',
        unserializableValue: '10n',
        description: '10n',
      }),
      '10n',
    );
  });
});
