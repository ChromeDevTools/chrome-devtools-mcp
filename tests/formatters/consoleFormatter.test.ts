/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ConsoleMessage} from 'puppeteer-core';

import {formatConsoleEvent} from '../../src/formatters/consoleFormatter.js';

function getMockConsoleMessage(options: {
  type: string;
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  stackTrace?: Array<{
    url: string;
    lineNumber: number;
    columnNumber: number;
  }>;
  args?: unknown[];
}): ConsoleMessage {
  return {
    type() {
      return options.type;
    },
    text() {
      return options.text;
    },
    location() {
      return options.location ?? {};
    },
    stackTrace() {
      return options.stackTrace ?? [];
    },
    args() {
      return (
        options.args?.map(arg => {
          return {
            evaluate(fn: (arg: unknown) => unknown) {
              return Promise.resolve(fn(arg));
            },
            jsonValue() {
              return Promise.resolve(arg);
            },
            dispose() {
              return Promise.resolve();
            },
          };
        }) ?? []
      );
    },
  } as ConsoleMessage;
}

describe('consoleFormatter', () => {
  describe('formatConsoleEvent', () => {
    it('formats a console.log message', async () => {
      const message = getMockConsoleMessage({
        type: 'log',
        text: 'Hello, world!',
        location: {
          url: 'http://example.com/script.js',
          lineNumber: 10,
          columnNumber: 5,
        },
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Log> script.js:10:5: Hello, world!');
    });

    it('formats a console.log message with arguments', async () => {
      const message = getMockConsoleMessage({
        type: 'log',
        text: 'Processing file:',
        args: ['file.txt', {id: 1, status: 'done'}],
        location: {
          url: 'http://example.com/script.js',
          lineNumber: 10,
          columnNumber: 5,
        },
      });
      const result = await formatConsoleEvent(message);
      assert.equal(
        result,
        'Log> script.js:10:5: Processing file: file.txt {"id":1,"status":"done"}',
      );
    });

    it('formats a console.error message', async () => {
      const message = getMockConsoleMessage({
        type: 'error',
        text: 'Something went wrong',
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Error> Something went wrong');
    });

    it('formats a console.error message with arguments', async () => {
      const message = getMockConsoleMessage({
        type: 'error',
        text: 'Something went wrong:',
        args: ['details', {code: 500}],
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Error> Something went wrong: details {"code":500}');
    });

    it('formats a console.error message with a stack trace', async () => {
      const message = getMockConsoleMessage({
        type: 'error',
        text: 'Something went wrong',
        stackTrace: [
          {
            url: 'http://example.com/script.js',
            lineNumber: 10,
            columnNumber: 5,
          },
          {
            url: 'http://example.com/script2.js',
            lineNumber: 20,
            columnNumber: 10,
          },
        ],
      });
      const result = await formatConsoleEvent(message);
      assert.equal(
        result,
        'Error> Something went wrong\nscript.js:10:5\nscript2.js:20:10',
      );
    });

    it('formats a console.error message with a JSHandle@error', async () => {
      const message = getMockConsoleMessage({
        type: 'error',
        text: 'JSHandle@error',
        args: [new Error('mock stack')],
      });
      const result = await formatConsoleEvent(message);
      assert.ok(result.startsWith('Error> Error: mock stack'));
    });

    it('formats a console.warn message', async () => {
      const message = getMockConsoleMessage({
        type: 'warning',
        text: 'This is a warning',
        location: {
          url: 'http://example.com/script.js',
          lineNumber: 10,
          columnNumber: 5,
        },
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Warning> script.js:10:5: This is a warning');
    });

    it('formats a console.info message', async () => {
      const message = getMockConsoleMessage({
        type: 'info',
        text: 'This is an info message',
        location: {
          url: 'http://example.com/script.js',
          lineNumber: 10,
          columnNumber: 5,
        },
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Info> script.js:10:5: This is an info message');
    });

    it('formats a page error', async () => {
      const error = new Error('Page crashed');
      error.stack = 'Error: Page crashed\n    at <anonymous>:1:1';
      const result = await formatConsoleEvent(error);
      assert.equal(result, 'Error: Page crashed');
    });

    it('formats a page error without a stack', async () => {
      const error = new Error('Page crashed');
      error.stack = undefined;
      const result = await formatConsoleEvent(error);
      assert.equal(result, 'Error: Page crashed');
    });

    it('formats a console.log message from a removed iframe - no location', async () => {
      const message = getMockConsoleMessage({
        type: 'log',
        text: 'Hello from iframe',
        location: {},
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Log> <unknown>: Hello from iframe');
    });

    it('formats a console.log message from a removed iframe with partial location', async () => {
      const message = getMockConsoleMessage({
        type: 'log',
        text: 'Hello from iframe',
        location: {
          lineNumber: 10,
          columnNumber: 5,
        },
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Log> <unknown>: Hello from iframe');
    });
  });
});
