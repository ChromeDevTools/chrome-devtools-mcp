/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import type {ConsoleMessageData} from '../../src/formatters/consoleFormatter.js';
import {
  formatConsoleEventShort,
  formatConsoleEventVerbose,
} from '../../src/formatters/consoleFormatter.js';
import type {DevTools} from '../../src/third_party/index.js';

describe('consoleFormatter', () => {
  describe('formatConsoleEventShort', () => {
    it('formats a console.log message', t => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 1,
        type: 'log',
        message: 'Hello, world!',
        args: [],
      };
      const result = formatConsoleEventShort(message);
      t.assert.snapshot?.(result);
    });

    it('formats a console.log message with one argument', t => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 2,
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt'],
      };
      const result = formatConsoleEventShort(message);
      t.assert.snapshot?.(result);
    });

    it('formats a console.log message with multiple arguments', t => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 3,
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt', 'another file'],
      };
      const result = formatConsoleEventShort(message);
      t.assert.snapshot?.(result);
    });
  });

  describe('formatConsoleEventVerbose', () => {
    it('formats a console.log message', t => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 1,
        type: 'log',
        message: 'Hello, world!',
        args: [],
      };
      const result = formatConsoleEventVerbose(message);
      t.assert.snapshot?.(result);
    });

    it('formats a console.log message with one argument', t => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 2,
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt'],
      };
      const result = formatConsoleEventVerbose(message);
      t.assert.snapshot?.(result);
    });

    it('formats a console.log message with multiple arguments', t => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 3,
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt', 'another file'],
      };
      const result = formatConsoleEventVerbose(message);
      t.assert.snapshot?.(result);
    });

    it('formats a console.error message', t => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 4,
        type: 'error',
        message: 'Something went wrong',
      };
      const result = formatConsoleEventVerbose(message);
      t.assert.snapshot?.(result);
    });

    it('formats a console message with a stack trace', t => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 5,
        type: 'log',
        message: 'Hello stack trace!',
        args: [],
        stackTrace: {
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
        } as unknown as DevTools.StackTrace.StackTrace.StackTrace,
      };
      const result = formatConsoleEventVerbose(message);
      t.assert.snapshot?.(result);
    });
  });
});
