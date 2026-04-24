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
import type {ConsoleMessage} from '../../src/third_party/index.js';

const createMockMessage = (
  type: string,
  text: string,
  argsCount = 0,
): ConsoleMessage => {
  const args = Array.from({length: argsCount}, () => ({
    jsonValue: async () => 'val',
    remoteObject: () => ({type: 'string'}),
  }));
  return {
    type: () => type,
    text: () => text,
    args: () => args,
  } as unknown as ConsoleMessage;
};

const makeFormatter = (id: number, type: string, text: string, argsCount = 0) =>
  ConsoleFormatter.from(createMockMessage(type, text, argsCount), {id});

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
