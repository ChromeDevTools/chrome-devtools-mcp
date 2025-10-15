/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {formatConsoleEvent} from '../../src/formatters/consoleFormatter.js';
import type {ConsoleMessageData} from '../../src/McpResponse.js';

describe('consoleFormatter', () => {
  describe('formatConsoleEvent', () => {
    it('formats a console.log message', () => {
      const message: ConsoleMessageData = {
        type: 'log',
        message: 'Hello, world!',
        args: [],
      };
      const result = formatConsoleEvent(message);
      assert.equal(result, 'Log> Hello, world!');
    });

    it('formats a console.log message with one argument', () => {
      const message: ConsoleMessageData = {
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt'],
      };
      const result = formatConsoleEvent(message);
      assert.equal(result, 'Log> Processing file: file.txt');
    });

    it('formats a console.log message with multiple arguments', () => {
      const message: ConsoleMessageData = {
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt', JSON.stringify({id: 1, status: 'done'})],
      };
      const result = formatConsoleEvent(message);
      assert.equal(result, 'Log> Processing file: file.txt ...');
    });

    it('formats a console.error message', () => {
      const message: ConsoleMessageData = {
        type: 'error',
        message: 'Something went wrong',
        args: [],
      };
      const result = formatConsoleEvent(message);
      assert.equal(result, 'Error> Something went wrong');
    });

    it('formats a console.error message with one argument', () => {
      const message: ConsoleMessageData = {
        type: 'error',
        message: 'Something went wrong:',
        args: ['details'],
      };
      const result = formatConsoleEvent(message);
      assert.equal(result, 'Error> Something went wrong: details');
    });

    it('formats a console.error message with multiple arguments', () => {
      const message: ConsoleMessageData = {
        type: 'error',
        message: 'Something went wrong:',
        args: ['details', JSON.stringify({code: 500})],
      };
      const result = formatConsoleEvent(message);
      assert.equal(result, 'Error> Something went wrong: details ...');
    });

    it('formats a console.warn message', () => {
      const message: ConsoleMessageData = {
        type: 'warning',
        message: 'This is a warning',
        args: [],
      };
      const result = formatConsoleEvent(message);
      assert.equal(result, 'Warning> This is a warning');
    });

    it('formats a console.info message', () => {
      const message: ConsoleMessageData = {
        type: 'info',
        message: 'This is an info message',
        args: [],
      };
      const result = formatConsoleEvent(message);
      assert.equal(result, 'Info> This is an info message');
    });

    it('formats a page error', () => {
      const error: ConsoleMessageData = {
        type: 'error',
        message: 'Error: Page crashed',
        args: [],
      };
      const result = formatConsoleEvent(error);
      assert.equal(result, 'Error> Error: Page crashed');
    });

    it('formats a page error without a stack', () => {
      const error: ConsoleMessageData = {
        type: 'error',
        message: 'Error: Page crashed',
        args: [],
      };
      const result = formatConsoleEvent(error);
      assert.equal(result, 'Error> Error: Page crashed');
    });
  });
});
