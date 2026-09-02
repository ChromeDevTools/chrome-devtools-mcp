/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the pages tool handlers.
 *
 * Verifies handler state mutations on McpResponse / McpContext without a real
 * browser.
 *
 * Part of the test-optimization effort described in
 * https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2639.
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  closePage,
  listPages,
  selectPage,
} from '../../src/tools/pages.js';
import {CLOSE_PAGE_ERROR} from '../../src/tools/ToolDefinition.js';
import {
  createMockMcpContext,
  createMockMcpPage,
  createMockMcpResponse,
} from '../testMocks.js';

afterEach(() => {
  sinon.restore();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: {handler: (...args: any[]) => Promise<void>}, params: Record<string, unknown> = {}) {
  const page = createMockMcpPage();
  const context = createMockMcpContext({selectedPage: page});
  const response = createMockMcpResponse();
  await tool.handler({params, page}, response, context);
  return {page, context, response};
}

describe('pages tool handlers (unit)', () => {
  // -------------------------------------------------------------------------
  // list_pages
  // -------------------------------------------------------------------------
  describe('listPages handler', () => {
    it('sets includePages to true on the response', async () => {
      const {response} = await run(listPages());
      assert.strictEqual(response.setIncludePages.callCount, 1);
      const [value] = response.setIncludePages.firstCall.args as [boolean];
      assert.strictEqual(value, true);
    });

    it('requests third-party developer tools listing', async () => {
      const {response} = await run(listPages());
      assert.strictEqual(response.setListThirdPartyDeveloperTools.callCount, 1);
    });

    it('requests web MCP tools listing', async () => {
      const {response} = await run(listPages());
      assert.strictEqual(response.setListWebMcpTools.callCount, 1);
    });
  });

  // -------------------------------------------------------------------------
  // select_page
  // -------------------------------------------------------------------------
  describe('selectPage handler', () => {
    it('calls context.selectPage with the page resolved by pageId', async () => {
      const targetPage = createMockMcpPage();
      const context = createMockMcpContext({selectedPage: targetPage});
      context.getPageById = sinon.stub().returns(targetPage);
      const response = createMockMcpResponse();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (selectPage as any).handler({params: {pageId: 2}}, response, context);

      assert.strictEqual(context.selectPage.callCount, 1);
      assert.strictEqual(context.selectPage.firstCall.args[0], targetPage);
    });

    it('looks up the page by the given pageId', async () => {
      const context = createMockMcpContext();
      const response = createMockMcpResponse();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (selectPage as any).handler({params: {pageId: 42}}, response, context);

      assert.strictEqual(context.getPageById.callCount, 1);
      assert.strictEqual(context.getPageById.firstCall.args[0], 42);
    });

    it('sets includePages on the response after selecting', async () => {
      const context = createMockMcpContext();
      const response = createMockMcpResponse();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (selectPage as any).handler({params: {pageId: 1}}, response, context);

      const [value] = response.setIncludePages.firstCall.args as [boolean];
      assert.strictEqual(value, true);
    });
  });

  // -------------------------------------------------------------------------
  // close_page
  // -------------------------------------------------------------------------
  describe('closePage handler', () => {
    it('calls context.closePage with the given pageId', async () => {
      const {context} = await run(closePage, {pageId: 3});
      assert.strictEqual(context.closePage.callCount, 1);
      assert.strictEqual(context.closePage.firstCall.args[0], 3);
    });

    it('sets includePages on the response after closing', async () => {
      const {response} = await run(closePage, {pageId: 3});
      assert.strictEqual(response.setIncludePages.callCount, 1);
      const [value] = response.setIncludePages.firstCall.args as [boolean];
      assert.strictEqual(value, true);
    });

    it('appends error message when CLOSE_PAGE_ERROR is thrown', async () => {
      const page = createMockMcpPage();
      const context = createMockMcpContext({selectedPage: page});
      context.closePage = sinon.stub().rejects(new Error(CLOSE_PAGE_ERROR));
      const response = createMockMcpResponse();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (closePage as any).handler({params: {pageId: 1}, page}, response, context);

      assert.strictEqual(response.appendResponseLine.callCount, 1);
      assert.strictEqual(response.responseLines[0], CLOSE_PAGE_ERROR);
    });
  });
});
