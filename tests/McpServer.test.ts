/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import sinon from 'sinon';

import {BrowserManager} from '../src/BrowserManager.js';
import {ConfigParser} from '../src/config/ConfigParser.js';
import {McpServer} from '../src/index.js';
import {McpContext} from '../src/McpContext.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';

import {createMockMcpContext, createMockPuppeteerBrowser} from './mocks.js';

describe('McpServer', () => {
  afterEach(() => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

  function parseArgs(argv: string[] = []) {
    return new ConfigParser(
      '1.0.0',

      ['node', 'script.js', ...argv],
      {
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
      },
    ).parse();
  }

  async function createTestServer(extraArgs: string[] = []) {
    const browserManager = sinon.createStubInstance(BrowserManager);
    const browser = createMockPuppeteerBrowser();
    browserManager.ensureBrowser.resolves(browser);

    const context = createMockMcpContext();
    context.browser = browser;
    context.getPages.returns([]);
    sinon.stub(McpContext, 'from').resolves(context);

    const server = await McpServer.from(parseArgs(extraArgs), {browserManager});
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

  describe('slim mode', () => {
    it('does not register slim tools without --slim', async () => {
      const {server} = await createTestServer();

      const result = await server.callTool('navigate', {url: 'about:blank'});

      assert.deepStrictEqual(result.content, [
        {type: 'text', text: 'Tool navigate not found'},
      ]);
    });

    it('registers only slim tools with --slim', async () => {
      const {server} = await createTestServer(['--slim']);

      const result = await server.callTool('list_pages');

      assert.deepStrictEqual(result.content, [
        {type: 'text', text: 'Tool list_pages not found'},
      ]);
    });
  });

  describe('applyConfig', () => {
    async function listToolNames(server: McpServer): Promise<string[]> {
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      const client = new Client({name: 'test', version: '1.0.0'});
      await client.connect(clientTransport);
      try {
        const {tools} = await client.listTools();
        return tools.map(tool => tool.name);
      } finally {
        await client.close();
      }
    }

    it('enables tools that were disabled', async () => {
      const {server} = await createTestServer();
      assert.ok(
        !(await listToolNames(server)).includes('get_heapsnapshot_summary'),
      );

      await server.applyConfig(parseArgs(['--memoryDebugging']));

      assert.ok(
        (await listToolNames(server)).includes('get_heapsnapshot_summary'),
      );
    });

    it('keeps the slim mode the server was started with', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseArgs(['--slim']));

      const toolNames = await listToolNames(server);
      assert.ok(toolNames.includes('navigate_page'));
      assert.ok(!toolNames.includes('navigate'));
    });

    it('disables tools that were enabled', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseArgs(['--no-category-network']));

      assert.ok(
        !(await listToolNames(server)).includes('list_network_requests'),
      );
    });

    it('uses the new arguments for tool calls', async () => {
      const {server, browserManager} = await createTestServer();

      await server.applyConfig(parseArgs(['--no-javascript-evaluation']));
      const result = await server.callTool('evaluate_script', {
        function: '() => 1',
        pageId: 1,
      });

      assert.strictEqual(result.isError, true);
      assert.match(
        result.content[0]?.type === 'text' ? result.content[0].text : '',
        /requires flag --javascriptEvaluation/,
      );
      sinon.assert.notCalled(browserManager.ensureBrowser);
    });

    it('updates the options of an existing context', async () => {
      const {server, context} = await createTestServer();
      await server.callTool('list_pages', {});

      await server.applyConfig(
        parseArgs(['--blockedUrlPattern', 'https://example.com/*']),
      );

      sinon.assert.calledOnceWithExactly(context.updateOptions, {
        experimentalIncludeAllPages: false,
        performanceCrux: true,
        sourceMaps: true,
        allowlist: undefined,
        blocklist: ['https://example.com/*'],
        allowUnrestrictedPaths: false,
      });
    });
  });
});
