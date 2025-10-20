/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  formatConsoleEventShort,
  formatConsoleEventVerbose,
} from '../../src/formatters/consoleFormatter.js';
import type {ConsoleMessageData} from '../../src/McpResponse.js';

describe('consoleFormatter', () => {
  describe('formatConsoleEventShort', () => {
    it('formats a console.log message', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 1,
        type: 'log',
        message: 'Hello, world!',
        args: [],
      };
      const result = formatConsoleEventShort(message);
      assert.equal(result, 'msgid=1 [log] Hello, world!');
    });

    it('formats a console.log message with one argument', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 2,
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt'],
      };
      const result = formatConsoleEventShort(message);
      assert.equal(result, 'msgid=2 [log] Processing file: Args: file.txt');
    });

    it('formats a console.log message with multiple arguments', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 3,
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt', 'another file'],
      };
      const result = formatConsoleEventShort(message);
      assert.equal(result, 'msgid=3 [log] Processing file: Args: file.txt ...');
    });

    it('does not include args if message is the same as arg', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 4,
        type: 'log',
        message: 'Hello',
        args: ['Hello'],
      };
      const result = formatConsoleEventShort(message);
      assert.equal(result, 'msgid=4 [log] Hello');
    });
  });

  describe('formatConsoleEventVerbose', () => {
    it('formats a console.log message', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 1,
        type: 'log',
        message: 'Hello, world!',
        args: [],
      };
      const result = formatConsoleEventVerbose(message);
      assert.equal(
        result,
        `Log> Hello, world!
  ID: 1
  Type: log`,
      );
    });

    it('formats a console.log message with one argument', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 2,
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt'],
      };
      const result = formatConsoleEventVerbose(message);
      assert.equal(
        result,
        `Log> Processing file: Args: file.txt
  ID: 2
  Type: log`,
      );
    });

    it('formats a console.log message with multiple arguments', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 3,
        type: 'log',
        message: 'Processing file:',
        args: ['file.txt', 'another file'],
      };
      const result = formatConsoleEventVerbose(message);
      assert.equal(
        result,
        `Log> Processing file: Args: file.txt another file
  ID: 3
  Type: log`,
      );
    });

    it('formats a console.error message', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 4,
        type: 'error',
        message: 'Something went wrong',
      };
      const result = formatConsoleEventVerbose(message);
      assert.equal(
        result,
        `Error> Something went wrong
  ID: 4
  Type: error`,
      );
    });

    it('does not include args if message is the same as arg', () => {
      const message: ConsoleMessageData = {
        consoleMessageStableId: 5,
        type: 'log',
        message: 'Hello',
        args: ['Hello', 'World'],
      };
      const result = formatConsoleEventVerbose(message);
      assert.equal(
        result,
        `Log> Hello Args: World
  ID: 5
  Type: log`,
      );
    });
  });
});
