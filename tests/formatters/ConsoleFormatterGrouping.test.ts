/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ConsoleFormatter} from '../../src/formatters/ConsoleFormatter.js';
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
      assert.strictEqual(grouped[0].count, 3);
      assert.strictEqual(grouped[0].lastId, 3);
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
        assert.strictEqual(g.count, 1);
        assert.strictEqual(g.lastId, undefined);
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
      assert.strictEqual(grouped[0].count, 2);
      assert.strictEqual(grouped[0].lastId, 2);
      assert.strictEqual(grouped[1].count, 1);
      assert.strictEqual(grouped[1].lastId, undefined);
      assert.strictEqual(grouped[2].count, 2);
      assert.strictEqual(grouped[2].lastId, 5);
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
      assert.strictEqual(grouped[0].count, 1);
      assert.strictEqual(grouped[0].lastId, undefined);
    });
  });

  describe('toStringGrouped', () => {
    it('appends count and lastId suffix when count > 1', async () => {
      const f = await makeFormatter(1, 'log', 'hello');
      const str = f.toStringGrouped(5, 5);
      assert.ok(str.includes('[5 times, last msgid=5]'), `expected [5 times, last msgid=5] in: ${str}`);
    });

    it('does not append count suffix when count is 1', async () => {
      const f = await makeFormatter(1, 'log', 'hello');
      const str = f.toStringGrouped(1);
      assert.ok(!str.includes('times'), `unexpected times in: ${str}`);
    });
  });

  describe('toJSONGrouped', () => {
    it('includes count and lastId when count > 1', async () => {
      const f = await makeFormatter(1, 'log', 'hello');
      const json = f.toJSONGrouped(3, 3);
      assert.strictEqual(json.count, 3);
      assert.strictEqual(json.lastId, 3);
    });

    it('does not include count or lastId when count is 1', async () => {
      const f = await makeFormatter(1, 'log', 'hello');
      const json = f.toJSONGrouped(1);
      assert.strictEqual(json.count, undefined);
      assert.strictEqual(json.lastId, undefined);
    });
  });
});
