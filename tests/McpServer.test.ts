/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {BrowserManager} from '../src/BrowserManager.js';
import {parseArguments} from '../src/config/mcp-options.js';
import {McpServer} from '../src/index.js';
import {McpContext} from '../src/McpContext.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';

import {createMockMcpContext, createMockPuppeteerBrowser} from './mocks.js';

describe('McpServer', () => {
  afterEach(() => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

  async function createTestServer() {
    const browserManager = sinon.createStubInstance(BrowserManager);
    const browser = createMockPuppeteerBrowser();
    browserManager.ensureBrowser.resolves(browser);

    const context = createMockMcpContext();
    context.browser = browser;
    context.getPages.returns([]);
    sinon.stub(McpContext, 'from').resolves(context);

    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });
    const server = await McpServer.from(serverArgs, {browserManager});
    return {server, browserManager, context};
  }

  describe('callTool', () => {
    it('returns an error for unknown tool names', async () => {
      const {server, browserManager} = await createTestServer();

      const result = await server.callTool('unknown_tool');

      assert.strictEqual(result.isError, true);
      assert.deepStrictEqual(result.content, [
        {
          type: 'text',
          text: 'Tool unknown_tool not found',
        },
      ]);
      sinon.assert.notCalled(browserManager.ensureBrowser);
    });

    it('returns a validation error when arguments fail Zod schema validation', async () => {
      const {server, browserManager} = await createTestServer();

      const result = await server.callTool('navigate_page', {url: 123});

      assert.strictEqual(result.isError, true);
      assert.strictEqual(result.content.length, 1);
      const firstBlock = result.content[0];
      assert.strictEqual(firstBlock.type, 'text');
      assert.match(
        firstBlock.text,
        /^Input validation error: Invalid arguments for tool navigate_page:/,
      );
      sinon.assert.notCalled(browserManager.ensureBrowser);
    });

    it('executes the tool handler when arguments are valid', async () => {
      const {server, browserManager, context} = await createTestServer();

      const result = await server.callTool('list_pages', {});

      assert.strictEqual(result.isError, undefined);
      sinon.assert.calledOnce(browserManager.ensureBrowser);
      sinon.assert.calledOnce(context.createPagesSnapshot);
    });
  });
});
