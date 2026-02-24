/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

function formatterTestConcise(
  label: string,
  setup: (t: it.TestContext) => Promise<ConsoleFormatter>,
) {
  it(label + ' toString', async t => {
    const formatter = await setup(t);
    t.assert.snapshot?.(formatter.toString());
  });
  it(label + ' toJSON', async t => {
    const formatter = await setup(t);
    t.assert.snapshot?.(JSON.stringify(formatter.toJSON(), null, 2));
  });
}

function formatterTestDetailed(
  label: string,
  setup: (t: it.TestContext) => Promise<ConsoleFormatter>,
) {
  it(label + ' toStringDetailed', async t => {
    const formatter = await setup(t);
    t.assert.snapshot?.(formatter.toStringDetailed());
  });
  it(label + ' toJSONDetailed', async t => {
    const formatter = await setup(t);
    t.assert.snapshot?.(JSON.stringify(formatter.toJSONDetailed(), null, 2));
  });
}

describe('ConsoleFormatter', () => {
  describe('toString/toJSON', () => {
    formatterTestConcise('formats a console.log message', async () => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Hello, world!',
      });
      return await ConsoleFormatter.from(message, {id: 1});
    });

    formatterTestConcise(
      'formats a console.log message with one argument',
      async () => {
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
        return await ConsoleFormatter.from(message, {id: 1});
      },
    );

    formatterTestConcise(
      'formats a console.log message with multiple arguments',
      async () => {
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
        return await ConsoleFormatter.from(message, {id: 1});
      },
    );

    formatterTestConcise('formats an UncaughtError', async () => {
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
      return await ConsoleFormatter.from(error, {id: 1});
    });
  });

  describe('toStringDetailed/toJSONDetailed', () => {
    formatterTestDetailed('formats a console.log message', async () => {
      const message = createMockMessage({
        type: () => 'log',
        text: () => 'Hello, world!',
      });
      return await ConsoleFormatter.from(message, {
        id: 1,
        fetchDetailedData: true,
      });
    });

    formatterTestDetailed(
      'formats a console.log message with one argument',
      async () => {
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
        return await ConsoleFormatter.from(message, {
          id: 1,
          fetchDetailedData: true,
        });
      },
    );

    formatterTestDetailed(
      'formats a console.log message with multiple arguments',
      async () => {
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
        return await ConsoleFormatter.from(message, {
          id: 1,
          fetchDetailedData: true,
        });
      },
    );

    formatterTestDetailed('formats a console.error message', async () => {
      const message = createMockMessage({
        type: () => 'error',
        text: () => 'Something went wrong',
      });
      return await ConsoleFormatter.from(message, {
        id: 1,
        fetchDetailedData: true,
      });
    });

    formatterTestDetailed(
      'formats a console message with a stack trace',
      async () => {
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

        return await ConsoleFormatter.from(message, {
          id: 1,
          resolvedStackTraceForTesting: stackTrace,
        });
      },
    );

    formatterTestDetailed(
      'handles "Execution context is not available" error in args',
      async () => {
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
        return await ConsoleFormatter.from(message, {
          id: 6,
          fetchDetailedData: true,
        });
      },
    );

    formatterTestDetailed(
      'formats an UncaughtError with a stack trace',
      async () => {
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

        return await ConsoleFormatter.from(error, {
          id: 7,
          resolvedStackTraceForTesting: stackTrace,
        });
      },
    );

    formatterTestDetailed(
      'formats a console message with an Error object argument',
      async () => {
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

        return await ConsoleFormatter.from(message, {
          id: 8,
          resolvedArgsForTesting: [error],
        });
      },
    );

    formatterTestDetailed(
      'formats a console message with an Error object with cause',
      async () => {
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

        return await ConsoleFormatter.from(message, {
          id: 9,
          resolvedArgsForTesting: [error],
        });
      },
    );

    formatterTestDetailed(
      'formats an UncaughtError with a stack trace and a cause',
      async () => {
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

        return await ConsoleFormatter.from(error, {
          id: 10,
          resolvedStackTraceForTesting: stackTrace,
          resolvedCauseForTesting: cause,
        });
      },
    );

    formatterTestDetailed(
      'limits the number lines for a stack trace',
      async () => {
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

        return await ConsoleFormatter.from(message, {
          id: 11,
          resolvedStackTraceForTesting: stackTrace,
        });
      },
    );

    formatterTestDetailed(
      'does not show call frames with ignore listed scripts',
      async () => {
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

        return await ConsoleFormatter.from(message, {
          id: 12,
          resolvedStackTraceForTesting: stackTrace,
          isIgnoredForTesting: frame =>
            Boolean(frame.url?.includes('node_modules')),
        });
      },
    );

    formatterTestDetailed(
      'does not show fragments where all frames are ignore listed',
      async () => {
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

        return await ConsoleFormatter.from(message, {
          id: 13,
          resolvedStackTraceForTesting: stackTrace,
          isIgnoredForTesting: frame =>
            Boolean(frame.url?.includes('node_modules')),
        });
      },
    );
  });
});
