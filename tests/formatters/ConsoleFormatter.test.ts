/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ConsoleFormatter} from '../../src/formatters/ConsoleFormatter.js';
import type {ConsoleMessage} from '../../src/third_party/index.js';
import type {DevTools} from '../../src/third_party/index.js';

interface MockConsoleMessage {
  type: () => string;
  text: () => string;
  args: () => Array<{jsonValue: () => Promise<unknown>}>;
  stackTrace?: DevTools.StackTrace.StackTrace.StackTrace;
}

const createMockMessage = (
  data: Partial<MockConsoleMessage> = {},
): ConsoleMessage => {
  return {
    type: () => data.type?.() ?? 'log',
    text: () => data.text?.() ?? '',
    args: () => data.args?.() ?? [],
    ...data,
  } as unknown as ConsoleMessage;
};

describe('ConsoleFormatter', () => {
  describe('toString', () => {
    it('formats a console.log message', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Hello, world!',
      });
      const result = (await ConsoleFormatter.from(message, {id: 1})).toString();
      t.assert.snapshot?.(result);
    });

    it('formats a console.log message with one argument', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Processing file:',
        args: () => [{jsonValue: async () => 'file.txt'}],
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 2, fetchDetailedData: true})
      ).toString();
      t.assert.snapshot?.(result);
    });

    it('formats a console.log message with multiple arguments', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Processing file:',
        args: () => [
          {jsonValue: async () => 'file.txt'},
          {jsonValue: async () => 'another file'},
        ],
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 3, fetchDetailedData: true})
      ).toString();
      t.assert.snapshot?.(result);
    });
  });

  describe('toStringDetailed', () => {
    it('formats a console.log message', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Hello, world!',
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 1})
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('formats a console.log message with one argument', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Processing file:',
        args: () => [{jsonValue: async () => 'file.txt'}],
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 2, fetchDetailedData: true})
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('formats a console.log message with multiple arguments', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Processing file:',
        args: () => [
          {jsonValue: async () => 'file.txt'},
          {jsonValue: async () => 'another file'},
        ],
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 3, fetchDetailedData: true})
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('formats a console.error message', async t => {
      const message = createMockMessage({
        type: () => 'error',
        text: () => 'Something went wrong',
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 4})
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('formats a console message with a stack trace', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Hello stack trace!',
      });
      const stackTrace = {
        syncFragment: {
          frames: [
            {
              line: 10,
              column: 2,
              url: 'foo.ts',
              name: 'foo',
            },
            {
              line: 20,
              column: 2,
              url: 'foo.ts',
              name: 'bar',
            },
          ],
        },
        asyncFragments: [
          {
            description: 'setTimeout',
            frames: [
              {
                line: 5,
                column: 2,
                url: 'util.ts',
                name: 'schedule',
              },
            ],
          },
        ],
      } as unknown as DevTools.StackTrace.StackTrace.StackTrace;

      const result = (
        await ConsoleFormatter.from(message, {
          id: 5,
          resolvedStackTraceForTesting: stackTrace,
        })
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('handles "Execution context is not available" error in args', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Processing file:',
        args: () => [
          {
            jsonValue: async () => {
              throw new Error('Execution context is not available');
            },
          },
        ],
      });
      const formatter = await ConsoleFormatter.from(message, {
        id: 6,
        fetchDetailedData: true,
      });
      const result = formatter.toStringDetailed();
      t.assert.snapshot?.(result);
      assert.ok(result.includes('<error: Argument 0 is no longer available>'));
    });
  });
  describe('toJSON', () => {
    it('formats a console.log message', async () => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Hello, world!',
      });
      const result = (await ConsoleFormatter.from(message, {id: 1})).toJSON();
      assert.deepStrictEqual(result, {
        type: 'log',
        text: 'Hello, world!',
        argsCount: 0,
        id: 1,
      });
    });

    it('formats a console.log message with args', async () => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Processing file:',
        args: () => [
          {jsonValue: async () => 'file.txt'},
          {jsonValue: async () => 'another file'},
        ],
      });
      const result = (await ConsoleFormatter.from(message, {id: 1})).toJSON();
      assert.deepStrictEqual(result, {
        type: 'log',
        text: 'Processing file:',
        argsCount: 2,
        id: 1,
      });
    });
  });

  describe('toJSONDetailed', () => {
    it('formats a console.log message', async () => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Hello, world!',
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 1})
      ).toJSONDetailed();
      assert.deepStrictEqual(result, {
        id: 1,
        type: 'log',
        text: 'Hello, world!',
        args: [],
        stackTrace: undefined,
      });
    });

    it('formats a console.log message with args', async () => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Processing file:',
        args: () => [
          {jsonValue: async () => 'file.txt'},
          {jsonValue: async () => 'another file'},
        ],
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 2, fetchDetailedData: true})
      ).toJSONDetailed();
      assert.deepStrictEqual(result, {
        id: 2,
        type: 'log',
        text: 'Processing file:',
        args: ['file.txt', 'another file'],
        stackTrace: undefined,
      });
    });
  });
});
