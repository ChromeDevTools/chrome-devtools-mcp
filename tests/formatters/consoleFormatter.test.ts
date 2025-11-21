/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {AggregatedIssue} from '../../node_modules/chrome-devtools-frontend/mcp/mcp.js';
import type {ConsoleMessageData} from '../../src/formatters/consoleFormatter.js';
import {
  formatConsoleEventShort,
  formatConsoleEventVerbose,
  formatIssue,
} from '../../src/formatters/consoleFormatter.js';
import {ISSUE_UTILS} from '../../src/issue-descriptions.js';

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
  });

  it('formats a console.log message with issue type', t => {
    class MockAggregatedIssue {
      getDescription() {
        return {
          file: 'mock-issue.md',
          substitutions: new Map([
            ['PLACEHOLDER_URL', 'http://example.com/issue-detail'],
          ]),
          links: [
            {link: 'http://example.com/learnmore', linkTitle: 'Learn more'},
            {link: 'http://example.com/another-learnmore', linkTitle: 'Learn more 2'},
          ],
        };
      }
    }
    const mockAggregatedIssue = new MockAggregatedIssue();
    const getIssueDescriptionStub = sinon.stub(
      ISSUE_UTILS,
      'getIssueDescription',
    );

    getIssueDescriptionStub
      .withArgs('mock-issue.md')
      .returns(
        '# Mock Issue Title\n\nThis is a mock issue description with a {PLACEHOLDER_URL}.',
      );
    const result = formatIssue(mockAggregatedIssue as AggregatedIssue);
    t.assert.snapshot?.(result);
  });
});
