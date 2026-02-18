/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {SymbolizedError} from '../../src/DevtoolsUtils.js';
import {ConsoleFormatter} from '../../src/formatters/ConsoleFormatter.js';
import {UncaughtError} from '../../src/PageCollector.js';
import type {ConsoleMessage, Protocol} from '../../src/third_party/index.js';
import type {DevTools} from '../../src/third_party/index.js';

interface MockConsoleMessage {
  type: () => string;
  text: () => string;
  args: () => Array<{
    jsonValue: () => Promise<unknown>;
    remoteObject: () => Protocol.Runtime.RemoteObject;
  }>;
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
        args: () => [
          {
            jsonValue: async () => 'file.txt',
            remoteObject: () => ({type: 'string'}),
          },
        ],
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
          {
            jsonValue: async () => 'file.txt',
            remoteObject: () => ({type: 'string'}),
          },
          {
            jsonValue: async () => 'another file',
            remoteObject: () => ({type: 'string'}),
          },
        ],
      });
      const result = (
        await ConsoleFormatter.from(message, {id: 3, fetchDetailedData: true})
      ).toString();
      t.assert.snapshot?.(result);
    });

    it('formats an UncaughtError', async t => {
      const error = new UncaughtError(
        {
          exceptionId: 1,
          lineNumber: 0,
          columnNumber: 5,
          exception: {
            type: 'object',
            description: 'TypeError: Cannot read properties of undefined',
          },
          text: 'Uncaught',
        },
        '<mock target ID>',
      );
      const result = (
        await ConsoleFormatter.from(error, {id: 4, fetchDetailedData: true})
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
        args: () => [
          {
            jsonValue: async () => 'file.txt',
            remoteObject: () => ({type: 'string'}),
          },
        ],
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
          {
            jsonValue: async () => 'file.txt',
            remoteObject: () => ({type: 'string'}),
          },
          {
            jsonValue: async () => 'another file',
            remoteObject: () => ({type: 'string'}),
          },
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
            remoteObject: () => ({type: 'string'}),
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

    it('formats an UncaughtError with a stack trace', async t => {
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
      const error = new UncaughtError(
        {
          exceptionId: 1,
          lineNumber: 0,
          columnNumber: 5,
          exception: {
            type: 'object',
            description: 'TypeError: Cannot read properties of undefined',
          },
          text: 'Uncaught',
        },
        '<mock target ID>',
      );

      const result = (
        await ConsoleFormatter.from(error, {
          id: 7,
          resolvedStackTraceForTesting: stackTrace,
        })
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('formats a console message with an Error object argument', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'JSHandle@error',
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
        asyncFragments: [],
      } as unknown as DevTools.StackTrace.StackTrace.StackTrace;
      const error = SymbolizedError.createForTesting(
        'TypeError: Cannot read properties of undefined',
        stackTrace,
      );

      const result = (
        await ConsoleFormatter.from(message, {
          id: 8,
          resolvedArgsForTesting: [error],
        })
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('formats a console message with an Error object with cause', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'JSHandle@error',
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
        asyncFragments: [],
      } as unknown as DevTools.StackTrace.StackTrace.StackTrace;
      const error = SymbolizedError.createForTesting(
        'AppError: Compute failed',
        stackTrace,
        SymbolizedError.createForTesting(
          'TypeError: Cannot read properties of undefined',
          {
            syncFragment: {
              frames: [
                {
                  line: 5,
                  column: 10,
                  url: 'library.js',
                  name: 'compute',
                },
              ],
            },
            asyncFragments: [],
          } as unknown as DevTools.StackTrace.StackTrace.StackTrace,
        ),
      );

      const result = (
        await ConsoleFormatter.from(message, {
          id: 9,
          resolvedArgsForTesting: [error],
        })
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('formats an UncaughtError with a stack trace and a cause', async t => {
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
      const error = new UncaughtError(
        {
          exceptionId: 1,
          lineNumber: 0,
          columnNumber: 5,
          exception: {
            type: 'object',
            description: 'TypeError: Cannot read properties of undefined',
          },
          text: 'Uncaught',
        },
        '<mock target ID>',
      );
      const cause = SymbolizedError.createForTesting(
        'TypeError: Cannot read properties of undefined',
        {
          syncFragment: {
            frames: [
              {
                line: 5,
                column: 8,
                url: 'library.js',
                name: 'compute',
              },
            ],
          },
          asyncFragments: [],
        } as unknown as DevTools.StackTrace.StackTrace.StackTrace,
      );

      const result = (
        await ConsoleFormatter.from(error, {
          id: 10,
          resolvedStackTraceForTesting: stackTrace,
          resolvedCauseForTesting: cause,
        })
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('limits the number lines for a stack trace', async t => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Hello stack trace!',
      });
      const frames: DevTools.StackTrace.StackTrace.Frame[] = [];
      for (let i = 0; i < 100; ++i) {
        frames.push({
          line: i,
          column: i,
          url: 'main.js',
          name: `fn${i}`,
        });
      }
      const stackTrace = {
        syncFragment: {frames},
        asyncFragments: [],
      } as unknown as DevTools.StackTrace.StackTrace.StackTrace;

      const result = (
        await ConsoleFormatter.from(message, {
          id: 11,
          resolvedStackTraceForTesting: stackTrace,
        })
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('does not show call frames with ignore listed scripts', async t => {
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
              line: 200,
              column: 46,
              url: './node_modules/some-third-party-package/lib/index.js',
              name: 'doThings',
            },
            {
              line: 250,
              column: 12,
              url: './node_modules/some-third-party-package/lib/index.js',
              name: 'doThings2',
            },
            {
              line: 20,
              column: 2,
              url: 'foo.ts',
              name: 'bar',
            },
          ],
        },
        asyncFragments: [],
      } as unknown as DevTools.StackTrace.StackTrace.StackTrace;

      const result = (
        await ConsoleFormatter.from(message, {
          id: 12,
          resolvedStackTraceForTesting: stackTrace,
          isIgnoredForTesting: frame =>
            Boolean(frame.url?.includes('node_modules')),
        })
      ).toStringDetailed();
      t.assert.snapshot?.(result);
    });

    it('does not show fragments where all frames are ignore listed', async t => {
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
          ],
        },
        asyncFragments: [
          {
            description: 'setTimeout',
            frames: [
              {
                line: 200,
                column: 46,
                url: './node_modules/some-third-party-package/lib/index.js',
                name: 'doThings',
              },
              {
                line: 250,
                column: 12,
                url: './node_modules/some-third-party-package/lib/index.js',
                name: 'doThings2',
              },
            ],
          },
          {
            description: 'await',
            frames: [
              {
                line: 20,
                column: 2,
                url: 'foo.ts',
                name: 'bar',
              },
            ],
          },
        ],
      } as unknown as DevTools.StackTrace.StackTrace.StackTrace;

      const result = (
        await ConsoleFormatter.from(message, {
          id: 13,
          resolvedStackTraceForTesting: stackTrace,
          isIgnoredForTesting: frame =>
            Boolean(frame.url?.includes('node_modules')),
        })
      ).toStringDetailed();
      t.assert.snapshot?.(result);
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
          {
            jsonValue: async () => 'file.txt',
            remoteObject: () => ({type: 'string'}),
          },
          {
            jsonValue: async () => 'another file',
            remoteObject: () => ({type: 'string'}),
          },
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
          {
            jsonValue: async () => 'file.txt',
            remoteObject: () => ({type: 'string'}),
          },
          {
            jsonValue: async () => 'another file',
            remoteObject: () => ({type: 'string'}),
          },
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
