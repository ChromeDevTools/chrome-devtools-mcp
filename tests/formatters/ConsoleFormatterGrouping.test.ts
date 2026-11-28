/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  ConsoleFormatter,
  GroupedConsoleFormatter,
} from '../../src/formatters/ConsoleFormatter.js';
import {UncaughtError} from '../../src/collectors/PageCollector.js';
import type {ConsoleMessage, Protocol} from '../../src/third_party/browser.js';

const createMockMessage = (
  type: string,
  text: string,
  argsCount = 0,
  remoteObject: Protocol.Runtime.RemoteObject = {type: 'string'},
): ConsoleMessage => {
  const args = Array.from({length: argsCount}, () => ({
    jsonValue: async () => 'val',
    remoteObject: () => remoteObject,
  }));
  return {
    type: () => type,
    text: () => text,
    args: () => args,
  } as unknown as ConsoleMessage;
};

const makeFormatter = (id: number, type: string, text: string, argsCount = 0) =>
  ConsoleFormatter.from(createMockMessage(type, text, argsCount), {id});

const makeFormatterWithArg = (
  id: number,
  text: string,
  arg: Protocol.Runtime.RemoteObject,
) => ConsoleFormatter.from(createMockMessage('log', text, 1, arg), {id});

const makeUncaughtErrorFormatter = (id: number) =>
  ConsoleFormatter.from(
    new UncaughtError(
      {
        exceptionId: id,
        lineNumber: 0,
        columnNumber: 5,
        exception: {type: 'object', subtype: 'error', description: 'Error: x'},
        text: 'Uncaught',
      },
      '<mock target ID>',
    ),
    {id},
  );

describe('ConsoleFormatter grouping', () => {
  describe('groupConsecutive', () => {
    it('groups identical consecutive messages', async () => {
      const msgs = await Promise.all([
        makeFormatter(1, 'log', 'hello'),
        makeFormatter(2, 'log', 'hello'),
        makeFormatter(3, 'log', 'hello'),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 1);
      assert.ok(grouped[0] instanceof GroupedConsoleFormatter);
      assert.ok(grouped[0].toString().includes('[3 times]'));
    });

    it('does not group different messages', async () => {
      const msgs = await Promise.all([
        makeFormatter(1, 'log', 'aaa'),
        makeFormatter(2, 'log', 'bbb'),
        makeFormatter(3, 'log', 'ccc'),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 3);
      for (const g of grouped) {
        assert.ok(!(g instanceof GroupedConsoleFormatter));
        assert.ok(!g.toString().includes('times'));
      }
    });

    it('groups A,A,B,A,A correctly', async () => {
      const msgs = await Promise.all([
        makeFormatter(1, 'log', 'A'),
        makeFormatter(2, 'log', 'A'),
        makeFormatter(3, 'log', 'B'),
        makeFormatter(4, 'log', 'A'),
        makeFormatter(5, 'log', 'A'),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 3);
      assert.ok(grouped[0] instanceof GroupedConsoleFormatter);
      assert.ok(grouped[0].toString().includes('[2 times]'));
      assert.ok(!(grouped[1] instanceof GroupedConsoleFormatter));
      assert.ok(grouped[2] instanceof GroupedConsoleFormatter);
      assert.ok(grouped[2].toString().includes('[2 times]'));
    });

    it('does not group messages with different types', async () => {
      const msgs = await Promise.all([
        makeFormatter(1, 'log', 'hello'),
        makeFormatter(2, 'error', 'hello'),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 2);
    });

    it('does not group messages with different argsCount', async () => {
      const msgs = await Promise.all([
        makeFormatter(1, 'log', 'hello', 1),
        makeFormatter(2, 'log', 'hello', 2),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 2);
    });

    it('does not group messages that log different objects', async () => {
      const msgs = await Promise.all([
        makeFormatterWithArg(1, '[object Object]', {
          type: 'object',
          className: 'Object',
          objectId: 'obj-1',
        }),
        makeFormatterWithArg(2, '[object Object]', {
          type: 'object',
          className: 'Object',
          objectId: 'obj-2',
        }),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 2);
      assert.strictEqual(
        grouped[1].toString(),
        'msgid=2 [log] [object Object] (1 args)',
      );
    });

    it('does not group a number and a string with the same text', async () => {
      const msgs = await Promise.all([
        makeFormatterWithArg(1, '1', {
          type: 'number',
          value: 1,
          description: '1',
        }),
        makeFormatterWithArg(2, '1', {type: 'string', value: '1'}),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 2);
    });

    it('groups messages that log the same string', async () => {
      const msgs = await Promise.all([
        makeFormatterWithArg(1, 'tick', {type: 'string', value: 'tick'}),
        makeFormatterWithArg(2, 'tick', {type: 'string', value: 'tick'}),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 1);
      assert.ok(grouped[0].toString().includes('[2 times]'));
    });

    it('groups messages that log null', async () => {
      const msgs = await Promise.all([
        makeFormatterWithArg(1, 'null', {type: 'object', subtype: 'null'}),
        makeFormatterWithArg(2, 'null', {type: 'object', subtype: 'null'}),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 1);
      assert.ok(grouped[0].toString().includes('[2 times]'));
    });

    it('groups messages that log the same error', async () => {
      const error: Protocol.Runtime.RemoteObject = {
        type: 'object',
        subtype: 'error',
        className: 'Error',
        description: 'Error: x\n    at a (f.js:1:1)',
      };
      const msgs = await Promise.all([
        makeFormatterWithArg(1, 'Error: x', {...error, objectId: 'err-1'}),
        makeFormatterWithArg(2, 'Error: x', {...error, objectId: 'err-2'}),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 1);
      assert.ok(grouped[0].toString().includes('[2 times]'));
    });

    it('does not group errors with different stacks', async () => {
      const error: Protocol.Runtime.RemoteObject = {
        type: 'object',
        subtype: 'error',
        className: 'Error',
      };
      const msgs = await Promise.all([
        makeFormatterWithArg(1, 'Error: x', {
          ...error,
          description: 'Error: x\n    at a (f.js:1:1)',
        }),
        makeFormatterWithArg(2, 'Error: x', {
          ...error,
          description: 'Error: x\n    at b (f.js:2:1)',
        }),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 2);
    });

    it('groups repeated uncaught errors', async () => {
      const msgs = await Promise.all([
        makeUncaughtErrorFormatter(1),
        makeUncaughtErrorFormatter(2),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 1);
      assert.ok(grouped[0].toString().includes('[2 times]'));
    });

    it('returns empty array for empty input', () => {
      const grouped = ConsoleFormatter.groupConsecutive([]);
      assert.strictEqual(grouped.length, 0);
    });

    it('handles single message', async () => {
      const msgs = await Promise.all([makeFormatter(1, 'log', 'solo')]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 1);
      assert.ok(!(grouped[0] instanceof GroupedConsoleFormatter));
    });
  });

  describe('GroupedConsoleFormatter output', () => {
    it('toString includes count suffix', async () => {
      const msgs = await Promise.all([
        makeFormatter(1, 'log', 'hello'),
        makeFormatter(2, 'log', 'hello'),
        makeFormatter(3, 'log', 'hello'),
        makeFormatter(4, 'log', 'hello'),
        makeFormatter(5, 'log', 'hello'),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 1);
      const str = grouped[0].toString();
      assert.ok(str.includes('[5 times]'), `expected [5 times] in: ${str}`);
      assert.ok(str.includes('msgid=1'), `expected msgid=1 in: ${str}`);
    });

    it('toJSON includes count field', async () => {
      const msgs = await Promise.all([
        makeFormatter(1, 'log', 'hello'),
        makeFormatter(2, 'log', 'hello'),
        makeFormatter(3, 'log', 'hello'),
      ]);
      const grouped = ConsoleFormatter.groupConsecutive(msgs);
      assert.strictEqual(grouped.length, 1);
      const json = (grouped[0] as GroupedConsoleFormatter).toJSON();
      assert.strictEqual(json.count, 3);
      assert.strictEqual(json.id, 1);
    });
  });
});
