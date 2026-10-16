/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import {Client, InMemoryTransport} from '@modelcontextprotocol/client';
import sinon from 'sinon';

import {BrowserManager} from '../src/BrowserManager.js';
import {getOffByDefaultCategories} from '../src/config/category-options.js';
import {ConfigParser} from '../src/config/ConfigParser.js';
import {mcpOptions} from '../src/config/mcp-options.js';
import {McpServer} from '../src/index.js';
import {McpContext} from '../src/McpContext.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';
import type {ToolCategory} from '../src/tools/categories.js';
import type {ToolDefinition} from '../src/tools/ToolDefinition.js';

import {createMockMcpContext, createMockPuppeteerBrowser} from './mocks.js';

describe('McpServer', () => {
  afterEach(() => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

  function parseConfig(argv: string[] = []) {
    return new ConfigParser('1.0.0', ['node', 'script.js', ...argv], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    }).parseConfig();
  }

  async function createTestServer(
    extraArgs: string[] = [],
    {mockContext = true}: {mockContext?: boolean} = {},
  ) {
    const browserManager = sinon.createStubInstance(BrowserManager);
    const browser = createMockPuppeteerBrowser();
    browserManager.ensureBrowser.resolves(browser);

    const context = createMockMcpContext();
    context.ensureBrowser.resolves(browser);
    context.getPages.returns([]);
    if (mockContext) {
      sinon.stub(McpContext, 'create').returns(context);
    }

    const config = parseConfig(extraArgs);
    const server = await McpServer.from(config, {browserManager});
    return {server, browserManager, context, config};
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
      const {server, context} = await createTestServer();

      const result = await server.callTool('list_pages', {});

      assert.strictEqual(result.isError, undefined);
      sinon.assert.calledOnce(context.ensureBrowser);
      sinon.assert.calledOnce(context.createPagesSnapshot);
    });

    it('does not launch or connect a browser for browserless tools', async () => {
      const {server, browserManager} = await createTestServer(
        ['--memoryDebugging', '--allowUnrestrictedPaths'],
        {mockContext: false},
      );

      const result = await server.callTool('get_heapsnapshot_summary', {
        filePath: path.resolve('tests/fixtures/heap-1.heapsnapshot'),
      });

      assert.strictEqual(result.isError, undefined);
      assert.strictEqual(result.content[0].type, 'text');
      assert.match(result.content[0].text, /## Heap Snapshot Data/);
      sinon.assert.notCalled(browserManager.ensureBrowser);
      await server.close();
    });
  });

  describe('slim mode', () => {
    it('disables slim tools without --slim', async () => {
      const {server} = await createTestServer();

      const result = await server.callTool('navigate', {url: 'about:blank'});

      assert.strictEqual(result.isError, true);
      assert.deepStrictEqual(result.content, [
        {type: 'text', text: 'Tool navigate is only available with --slim.'},
      ]);
    });

    it('disables non-slim tools with --slim', async () => {
      const {server} = await createTestServer(['--slim']);

      const result = await server.callTool('list_pages');

      assert.strictEqual(result.isError, true);
      assert.deepStrictEqual(result.content, [
        {
          type: 'text',
          text: 'Tool list_pages is not available with --slim.',
        },
      ]);
    });
  });

  describe('tool list', () => {
    async function listToolNames(extraArgs: string[] = []): Promise<string[]> {
      const {server} = await createTestServer(extraArgs);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      const client = new Client({name: 'test', version: '1.0.0'});
      await client.connect(clientTransport);
      try {
        const {tools} = await client.listTools();
        return tools.map(tool => tool.name).sort();
      } finally {
        await client.close();
        await server.close();
      }
    }

    it('has all tools with off by default categories', async () => {
      const exposedNames = await listToolNames(
        getOffByDefaultCategories().map(category => `--category-${category}`),
      );
      const definedNames = await getToolsWithFilteredCategories();
      assert.deepStrictEqual(exposedNames, definedNames.sort());
    });

    it('has all tools', async () => {
      const exposedNames = await listToolNames();
      const definedNames = await getToolsWithFilteredCategories(
        getOffByDefaultCategories(),
      );
      assert.deepStrictEqual(exposedNames, definedNames.sort());
    });

    it('has experimental third-party developer tools', async () => {
      const names = await listToolNames([
        '--category-experimental-third-party',
      ]);
      assert.ok(names.includes('list_3p_developer_tools'));
    });

    it('has experimental extensions tools', async () => {
      const names = await listToolNames(['--category-extensions']);
      assert.ok(names.includes('install_extension'));
    });

    it('has experimental vision tools', async () => {
      const names = await listToolNames(['--experimental-vision']);
      assert.ok(names.includes('click_at'));
    });

    it('has experimental interop tools', async () => {
      const names = await listToolNames(['--experimental-interop-tools']);
      assert.ok(names.includes('get_tab_id'));
    });

    it('has experimental webmcp', async () => {
      const names = await listToolNames(['--categoryExperimentalWebmcp']);
      assert.ok(names.includes('list_webmcp_tools'));
      assert.ok(names.includes('execute_webmcp_tool'));
    });

    it('has memory debugging tools', async () => {
      const names = await listToolNames(['--memoryDebugging']);
      assert.ok(names.includes('get_heapsnapshot_summary'));
    });

    it('can disable javascript evaluation tools', async () => {
      const names = await listToolNames(['--no-javascript-evaluation']);
      assert.ok(!names.includes('evaluate_script'));
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

      await server.applyConfig(parseConfig(['--memoryDebugging']));

      assert.ok(
        (await listToolNames(server)).includes('get_heapsnapshot_summary'),
      );
    });

    it('toggles slim mode', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseConfig(['--slim']));

      const slimToolNames = await listToolNames(server);
      assert.ok(!slimToolNames.includes('navigate_page'));
      assert.ok(slimToolNames.includes('navigate'));
    });

    it('disables tools that were enabled', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseConfig(['--no-category-network']));

      assert.ok(
        !(await listToolNames(server)).includes('list_network_requests'),
      );
    });

    it('uses the new arguments for tool calls', async () => {
      const {server, browserManager} = await createTestServer();

      await server.applyConfig(parseConfig(['--no-javascript-evaluation']));
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

    it('validates MCP tool calls queued behind applyConfig against the updated config', async () => {
      const {server, context} = await createTestServer();
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      const client = new Client({name: 'test', version: '1.0.0'});
      await client.connect(clientTransport);

      try {
        const {promise: firstBrowser, resolve: releaseFirstCall} =
          Promise.withResolvers<
            ReturnType<typeof createMockPuppeteerBrowser>
          >();
        const {promise: firstCallEntered, resolve: markFirstCallEntered} =
          Promise.withResolvers<void>();
        context.ensureBrowser.onFirstCall().callsFake(async () => {
          markFirstCallEntered();
          return await firstBrowser;
        });

        const firstCall = client.callTool({name: 'list_pages', arguments: {}});
        await firstCallEntered;

        const applyPromise = server.applyConfig(
          parseConfig(['--no-page-id-routing']),
        );
        const secondCall = client.callTool({
          name: 'list_console_messages',
          arguments: {pageId: 1},
        });

        releaseFirstCall(createMockPuppeteerBrowser());
        await firstCall;
        await applyPromise;
        const secondResult = await secondCall;

        assert.strictEqual(secondResult.isError, true);
        const content = secondResult.content;
        assert.ok(Array.isArray(content));
        assert.strictEqual(content[0]?.type, 'text');
        assert.match(
          content[0].text,
          /^Input validation error: Invalid arguments for tool list_console_messages: .*pageId/,
        );
      } finally {
        await client.close();
      }
    });

    it('commits the shared config and notifies the context with previous args', async () => {
      const {server, context, config} = await createTestServer([
        '--blockedUrlPattern',
        'https://example.com/*',
      ]);
      const previousArgs = config.resolved;
      let cruxWhenNotified: boolean | undefined;
      context.onConfigChanged.callsFake(async () => {
        cruxWhenNotified = config.resolved.performanceCrux;
      });

      await server.applyConfig(parseConfig(['--no-performance-crux']));

      sinon.assert.calledOnceWithExactly(context.onConfigChanged, previousArgs);
      assert.strictEqual(cruxWhenNotified, false);
      assert.deepStrictEqual(config.resolved.blockedUrlPattern, [
        'https://example.com/*',
      ]);
    });

    it('keeps restart-required options the server was started with', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseConfig(['--categoryExtensions']));

      assert.ok(!(await listToolNames(server)).includes('install_extension'));
    });

    it('does not notify the client when no tool changed', async () => {
      const {server} = await createTestServer();
      const sendToolListChanged = sinon.spy(
        server.server,
        'sendToolListChanged',
      );

      await server.applyConfig(parseConfig());

      sinon.assert.notCalled(sendToolListChanged);
    });

    it('does not connect a browser when experimentalIncludeAllPages changes before a browser connects', async () => {
      const {server, browserManager} = await createTestServer([], {
        mockContext: false,
      });

      await server.applyConfig(parseConfig(['--experimentalIncludeAllPages']));

      sinon.assert.notCalled(browserManager.ensureBrowser);
      await server.close();
    });
  });
});

async function getToolsWithFilteredCategories(
  filterOutCategories: ToolCategory[] = [],
): Promise<string[]> {
  const files = fs.readdirSync('build/src/tools');
  const definedNames = [];
  for (const file of files) {
    if (
      !file.endsWith('.js') ||
      file === 'ToolDefinition.js' ||
      file === 'tools.js' ||
      file === 'slim'
    ) {
      continue;
    }
    const fileTools = await import(`../src/tools/${file}`);

    for (const maybeTool of Object.values(fileTools)) {
      if (typeof maybeTool !== 'function') {
        continue;
      }
      const tool = maybeTool({});

      // Skipping all files that are not tool files
      if (tool === null || typeof tool !== 'object' || !('name' in tool)) {
        continue;
      }

      if (toolShouldBeSkipped(tool, filterOutCategories)) {
        continue;
      }
      definedNames.push(tool.name);
    }
  }
  return definedNames;
}

function toolShouldBeSkipped(
  tool: ToolDefinition,
  filteredOutCategories: ToolCategory[],
) {
  if (tool.annotations?.conditions) {
    for (const condition of tool.annotations.conditions) {
      const option = mcpOptions[condition as keyof typeof mcpOptions];
      if (!option || !('default' in option) || option.default !== true) {
        return true;
      }
    }
  }
  if (
    tool.annotations?.category &&
    filteredOutCategories.includes(tool.annotations?.category)
  ) {
    return true;
  }

  return false;
}
