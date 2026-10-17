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
import {createTempFile} from './utils.js';

describe('McpServer', () => {
  afterEach(() => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

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

    const serverArgs = new ConfigParser(
      '1.0.0',
      ['node', 'script.js', ...extraArgs],
      {
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
      },
    ).parse();
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

  describe('oninitialized', () => {
    const tempDirectoryWarning =
      '[chrome-devtools-mcp] The connecting client did not negotiate the MCP roots ' +
      'capability. Tools that read or write local files will be restricted to the OS temp directory. ' +
      'To restore the previous unrestricted behavior, start the server with ' +
      '--allow-unrestricted-paths.';

    async function warnOnInitialized(
      extraArgs: string[] = [],
      clientHasRoots = false,
    ) {
      const {server} = await createTestServer(extraArgs);
      const protocol = server.server.server;
      sinon
        .stub(protocol, 'getClientCapabilities')
        .returns(clientHasRoots ? {roots: {}} : {});
      sinon.stub(protocol, 'getClientVersion').returns(undefined);
      if (clientHasRoots) {
        sinon.stub(protocol, 'request').resolves({roots: []});
      }
      const warnStub = sinon.stub(console, 'warn');
      const oninitialized = protocol.oninitialized;
      assert.ok(oninitialized);
      oninitialized();
      await Promise.resolve();
      return warnStub;
    }

    it('warns when default flags meet a client without roots', async () => {
      const warnStub = await warnOnInitialized();

      sinon.assert.calledOnceWithExactly(warnStub, tempDirectoryWarning);
    });

    it('warns when filesystem roots are explicitly empty', async () => {
      using configFile = createTempFile(
        JSON.stringify({filesystemRoot: []}),
        'cd4a.test.config.empty-filesystem-root.json',
      );

      const warnStub = await warnOnInitialized(['--config', configFile.path]);

      sinon.assert.calledOnceWithExactly(warnStub, tempDirectoryWarning);
    });

    it('does not warn for an explicit workspace', async () => {
      const warnStub = await warnOnInitialized([
        '--workspace=/tmp/explicit-workspace',
      ]);

      sinon.assert.notCalled(warnStub);
    });

    it('does not warn when unrestricted paths are allowed', async () => {
      const warnStub = await warnOnInitialized(['--allow-unrestricted-paths']);

      sinon.assert.notCalled(warnStub);
    });

    it('does not warn when started via the CLI', async () => {
      const warnStub = await warnOnInitialized(['--viaCli']);

      sinon.assert.notCalled(warnStub);
    });

    it('does not warn when the client negotiates roots', async () => {
      const warnStub = await warnOnInitialized([], true);

      sinon.assert.notCalled(warnStub);
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
