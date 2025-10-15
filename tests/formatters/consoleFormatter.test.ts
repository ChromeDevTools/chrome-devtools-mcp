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
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Log> Hello, world!');
    });

    it('formats a console.log message with one argument', async () => {
      const message = getMockConsoleMessage({
        type: 'log',
        text: 'Processing file:',
        args: ['file.txt'],
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Log> Processing file: file.txt');
    });

    it('formats a console.log message with multiple arguments', async () => {
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
      assert.equal(result, 'Log> Processing file: file.txt ...');
    });

    it('formats a console.error message', async () => {
      const message = getMockConsoleMessage({
        type: 'error',
        text: 'Something went wrong',
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Error> Something went wrong');
    });

    it('formats a console.error message with one argument', async () => {
      const message = getMockConsoleMessage({
        type: 'error',
        text: 'Something went wrong:',
        args: ['details'],
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Error> Something went wrong: details');
    });

    it('formats a console.error message with multiple arguments', async () => {
      const message = getMockConsoleMessage({
        type: 'error',
        text: 'Something went wrong:',
        args: ['details', {code: 500}],
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Error> Something went wrong: details ...');
    });

    it('formats a console.warn message', async () => {
      const message = getMockConsoleMessage({
        type: 'warning',
        text: 'This is a warning',
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Warning> This is a warning');
    });

    it('formats a console.info message', async () => {
      const message = getMockConsoleMessage({
        type: 'info',
        text: 'This is an info message',
      });
      const result = await formatConsoleEvent(message);
      assert.equal(result, 'Info> This is an info message');
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
  });
});
