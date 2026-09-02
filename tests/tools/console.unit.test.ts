/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the console tool handlers.
 *
 * Verifies that handlers set the correct state on McpResponse without a real
 * browser.
 *
 * Part of the test-optimization effort described in
 * https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2639.
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  getConsoleMessage,
  listConsoleMessages,
} from '../../src/tools/console.js';
import {
  createMockMcpContext,
  createMockMcpPage,
  createMockMcpResponse,
} from '../testMocks.js';

afterEach(() => {
  sinon.restore();
});

/** Invoke a tool handler with mock objects, casting away strict types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: {handler: (...args: any[]) => Promise<void>}, params: Record<string, unknown> = {}) {
  const page = createMockMcpPage();
  const context = createMockMcpContext({selectedPage: page});
  const response = createMockMcpResponse();
  await tool.handler({params, page}, response, context);
  return {page, context, response};
}

describe('console tool handlers (unit)', () => {
  // -------------------------------------------------------------------------
  // list_console_messages
  // -------------------------------------------------------------------------
  describe('listConsoleMessages handler', () => {
    it('sets includeConsoleData to true on the response', async () => {
      const {response} = await run(listConsoleMessages());
      assert.strictEqual(response.setIncludeConsoleData.callCount, 1);
      const [value] = response.setIncludeConsoleData.firstCall.args as [boolean, unknown];
      assert.strictEqual(value, true);
    });

    it('passes pageSize and pageIdx through to the response', async () => {
      const {response} = await run(listConsoleMessages(), {pageSize: 10, pageIdx: 2});
      const [, options] = response.setIncludeConsoleData.firstCall.args as [boolean, {pageSize?: number; pageIdx?: number}];
      assert.strictEqual(options.pageSize, 10);
      assert.strictEqual(options.pageIdx, 2);
    });

    it('passes types filter through to the response', async () => {
      const {response} = await run(listConsoleMessages(), {types: ['error', 'warn']});
      const [, options] = response.setIncludeConsoleData.firstCall.args as [boolean, {types?: string[]}];
      assert.deepStrictEqual(options.types, ['error', 'warn']);
    });

    it('passes includeStackTraces through to the response', async () => {
      const {response} = await run(listConsoleMessages(), {includeStackTraces: true});
      const [, options] = response.setIncludeConsoleData.firstCall.args as [boolean, {includeStackTraces?: boolean}];
      assert.strictEqual(options.includeStackTraces, true);
    });

    it('passes serviceWorkerId through to the response', async () => {
      const {response} = await run(listConsoleMessages(), {serviceWorkerId: 'sw-abc123'});
      const [, options] = response.setIncludeConsoleData.firstCall.args as [boolean, {serviceWorkerId?: string}];
      assert.strictEqual(options.serviceWorkerId, 'sw-abc123');
    });

    it('passes includePreservedMessages through to the response', async () => {
      const {response} = await run(listConsoleMessages(), {includePreservedMessages: true});
      const [, options] = response.setIncludeConsoleData.firstCall.args as [boolean, {includePreservedMessages?: boolean}];
      assert.strictEqual(options.includePreservedMessages, true);
    });
  });

  // -------------------------------------------------------------------------
  // get_console_message
  // -------------------------------------------------------------------------
  describe('getConsoleMessage handler', () => {
    it('attaches the console message id to the response', async () => {
      const {response} = await run(getConsoleMessage, {msgid: 42});
      assert.strictEqual(response.attachConsoleMessage.callCount, 1);
      const [msgid] = response.attachConsoleMessage.firstCall.args as [number];
      assert.strictEqual(msgid, 42);
    });

    it('forwards the exact msgid provided', async () => {
      const {response} = await run(getConsoleMessage, {msgid: 7});
      const [msgid] = response.attachConsoleMessage.firstCall.args as [number];
      assert.strictEqual(msgid, 7);
    });
  });
});
