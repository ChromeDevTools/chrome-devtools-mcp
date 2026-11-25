/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import {Client, InMemoryTransport} from '@modelcontextprotocol/client';
import sinon from 'sinon';

import {BrowserManager} from '../src/BrowserManager.js';
import {getOffByDefaultCategories} from '../src/config/category-options.js';
import {ConfigLocator} from '../src/config/ConfigLocator.js';
import {ConfigParser} from '../src/config/ConfigParser.js';
import {ConfigWatcher} from '../src/config/ConfigWatcher.js';
import {mcpOptions} from '../src/config/mcp-options.js';
import {getIssueDescription} from '../src/devtools/issueDescriptions.js';
import {McpServer} from '../src/index.js';
import {McpContext} from '../src/McpContext.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';
import {ScreenRecorder} from '../src/third_party/browser.js';
import {ToolHandler} from '../src/ToolHandler.js';
import type {ToolCategory} from '../src/tools/categories.js';
import type {ToolDefinition} from '../src/tools/ToolDefinition.js';
import {saveLogsToFile} from '../src/utils/logger.js';

import {
  createMockMcpContext,
  createMockPuppeteerBrowser,
  createMockPuppeteerPage,
  createMockPuppeteerTarget,
} from './mocks.js';
import {createTempFile} from './utils.js';

describe('McpServer', () => {
  afterEach(() => {
    ClearcutLogger.resetForTesting();
  });

  function createConfigParser(argv: string[] = []) {
    const locator = new ConfigLocator();
    sinon.stub(locator, 'locate').returns(undefined);
    return new ConfigParser(
      '1.0.0',
      ['node', 'script.js', ...argv],
      {
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
      },
      false,
      locator,
    );
  }

  function parseConfig(argv: string[] = []) {
    return createConfigParser(argv).parseConfig();
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

    const configParser = createConfigParser(extraArgs);
    const config = configParser.parseConfig();
    const server = await McpServer.from(config, {browserManager});
    return {server, browserManager, context, config, configParser};
  }

  async function connectClient(server: McpServer): Promise<Client> {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({name: 'test', version: '1.0.0'});
    await client.connect(clientTransport);
    return client;
  }

  async function listServerTools(server: McpServer) {
    const client = await connectClient(server);
    try {
      const {tools} = await client.listTools();
      return tools;
    } finally {
      await client.close();
    }
  }

  async function listServerToolNames(server: McpServer): Promise<string[]> {
    const tools = await listServerTools(server);
    return tools.map(tool => tool.name);
  }

  it('loads issue descriptions on the first tool call instead of startup', async () => {
    const {server} = await createTestServer();

    assert.strictEqual(
      getIssueDescription('bounceTrackingMitigations.md'),
      null,
    );

    await server.callTool('list_pages', {});

    assert.ok(getIssueDescription('bounceTrackingMitigations.md'));
    await server.close();
  });

  it('creates the context on the first tool call with the navigation limit', async () => {
    const context = createMockMcpContext();
    context.ensureBrowser.resolves(createMockPuppeteerBrowser());
    context.getPages.returns([]);
    const createContext = sinon.stub(McpContext, 'create').returns(context);
    const {server, browserManager, config} = await createTestServer(
      ['--maxNavigationSaved=5'],
      {mockContext: false},
    );

    sinon.assert.notCalled(createContext);
    await server.callTool('list_pages', {});

    sinon.assert.calledOnceWithExactly(
      createContext,
      sinon.match.any,
      sinon.match({config: sinon.match.same(config)}),
    );
    assert.strictEqual(config.resolved.maxNavigationSaved, 5);
    sinon.assert.notCalled(browserManager.ensureBrowser);
    await server.close();
  });

  it('applies roots updates and config reloads received while idle when the first tool call creates the context', async () => {
    const context = createMockMcpContext();
    context.ensureBrowser.resolves(createMockPuppeteerBrowser());
    context.getPages.returns([]);
    const createContext = sinon.stub(McpContext, 'create').returns(context);
    const {server, config} = await createTestServer([], {mockContext: false});

    const initialClientRoot = 'file:///tmp/initial-client-root';
    const updatedClientRoot = 'file:///tmp/updated-client-root';
    let currentClientRoot = initialClientRoot;
    const rootsListed = Promise.withResolvers<void>();
    let listCount = 0;

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client(
      {name: 'test', version: '1.0.0'},
      {capabilities: {roots: {listChanged: true}}},
    );
    client.setRequestHandler('roots/list', () => {
      listCount++;
      if (listCount === 2) {
        rootsListed.resolve();
      }
      return {roots: [{uri: currentClientRoot, name: 'client-root'}]};
    });
    await client.connect(clientTransport);

    try {
      currentClientRoot = updatedClientRoot;
      await client.notification({method: 'notifications/roots/list_changed'});
      await rootsListed.promise;

      const reloadedRootPath = path.resolve('/tmp/reloaded-workspace');
      await server.applyConfig(
        parseConfig([
          '--no-performance-crux',
          `--workspace=${reloadedRootPath}`,
        ]),
      );

      sinon.assert.notCalled(createContext);
      sinon.assert.notCalled(context.setRoots);
      sinon.assert.notCalled(context.onConfigChanged);

      const result = await server.callTool('list_pages', {});

      assert.strictEqual(result.isError, undefined);
      sinon.assert.calledOnceWithExactly(
        createContext,
        sinon.match.any,
        sinon.match({config: sinon.match.same(config)}),
      );
      assert.strictEqual(config.resolved.performanceCrux, false);
      sinon.assert.calledOnceWithExactly(context.setRoots, [
        {
          uri: pathToFileURL(reloadedRootPath).href,
          name: 'reloaded-workspace',
        },
        {
          uri: updatedClientRoot,
          name: 'client-root',
        },
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('creates a single context when two tool calls start concurrently', async () => {
    const context = createMockMcpContext();
    context.ensureBrowser.resolves(createMockPuppeteerBrowser());
    context.getPages.returns([]);
    const createContext = sinon.stub(McpContext, 'create').returns(context);
    const {server, config} = await createTestServer([], {mockContext: false});

    const [firstResult, secondResult] = await Promise.all([
      server.callTool('list_pages', {}),
      server.callTool('list_pages', {}),
    ]);

    assert.strictEqual(firstResult.isError, undefined);
    assert.strictEqual(secondResult.isError, undefined);
    sinon.assert.calledOnceWithExactly(
      createContext,
      sinon.match.any,
      sinon.match({config: sinon.match.same(config)}),
    );
    await server.close();
  });

  it('closes without creating or disposing a context when no tool ran', async () => {
    const context = createMockMcpContext();
    const createContext = sinon.stub(McpContext, 'create').returns(context);
    const {server} = await createTestServer([], {mockContext: false});

    await server.close();

    sinon.assert.notCalled(createContext);
    sinon.assert.notCalled(context.dispose);
  });

  it('rejects tool calls after close without creating a context', async () => {
    const context = createMockMcpContext();
    const createContext = sinon.stub(McpContext, 'create').returns(context);
    const {server} = await createTestServer([], {mockContext: false});

    await server.close();

    await assert.rejects(
      server.callTool('list_pages', {}),
      /MCP server is closed/,
    );
    sinon.assert.notCalled(createContext);
    sinon.assert.notCalled(context.dispose);
  });

  it('disposes a context created while the server is closing and rejects the call', async () => {
    const context = createMockMcpContext();
    const createContext = sinon.stub(McpContext, 'create').returns(context);
    const {server, config} = await createTestServer([], {mockContext: false});

    const callPromise = server.callTool('list_pages', {});
    // Let #getContext() finish awaiting #initialRoots and start import().
    await Promise.resolve();
    const closePromise = server.close();

    await assert.rejects(callPromise, /MCP server is closed/);
    await closePromise;
    sinon.assert.calledOnceWithExactly(
      createContext,
      sinon.match.any,
      sinon.match({config: sinon.match.same(config)}),
    );
    sinon.assert.calledOnceWithExactly(context.dispose);
  });

  it('retries creating the context when a previous creation threw', async () => {
    const context = createMockMcpContext();
    context.ensureBrowser.resolves(createMockPuppeteerBrowser());
    context.getPages.returns([]);
    const createContext = sinon
      .stub(McpContext, 'create')
      .onFirstCall()
      .throws(new Error('context init failed'))
      .onSecondCall()
      .returns(context);
    const {server, config} = await createTestServer([], {mockContext: false});

    await assert.rejects(
      server.callTool('list_pages', {}),
      /context init failed/,
    );
    const result = await server.callTool('list_pages', {});

    assert.strictEqual(result.isError, undefined);
    sinon.assert.calledTwice(createContext);
    sinon.assert.calledWithExactly(
      createContext.firstCall,
      sinon.match.any,
      sinon.match({config: sinon.match.same(config)}),
    );
    sinon.assert.calledWithExactly(
      createContext.secondCall,
      sinon.match.any,
      sinon.match({config: sinon.match.same(config)}),
    );
    await server.close();
  });

  describe('callTool', () => {
    it('forwards the MCP request signal through the dispatcher', async () => {
      const started = Promise.withResolvers<AbortSignal>();
      const aborted = Promise.withResolvers<void>();
      const handle = sinon
        .stub(ToolHandler.prototype, 'handle')
        .callsFake(async (_args, options) => {
          const signal = options?.signal;
          assert.ok(signal);
          signal.addEventListener('abort', () => aborted.resolve(), {
            once: true,
          });
          started.resolve(signal);
          await aborted.promise;
          signal.throwIfAborted();
          return {content: []};
        });
      const {server} = await createTestServer();
      const client = await connectClient(server);
      try {
        const controller = new AbortController();
        const pending = client.callTool(
          {name: 'list_pages', arguments: {}},
          {signal: controller.signal},
        );
        const signal = await started.promise;
        sinon.assert.calledOnceWithExactly(handle, {}, {viaMcp: true, signal});
        assert.strictEqual(signal.aborted, false);
        controller.abort();
        await assert.rejects(pending);
        await aborted.promise;
        assert.strictEqual(signal.aborted, true);
      } finally {
        await client.close();
        await server.close();
      }
    });

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

    it('returns a validation error when transform validation fails', async () => {
      const {server, browserManager} = await createTestServer();
      const cases: Array<[Record<string, unknown>, RegExp]> = [
        [
          {pageId: 1, geolocation: '0x0'},
          /^Input validation error: Invalid arguments for tool emulate: geolocation: Invalid geolocation "0x0"\. Expected '<latitude>,<longitude>'\.$/,
        ],
        [
          {pageId: 1, geolocation: 'abc,11.5'},
          /^Input validation error: Invalid arguments for tool emulate: geolocation\.latitude: Expected a number$/,
        ],
        [
          {pageId: 1, viewport: '0x0'},
          /^Input validation error: Invalid arguments for tool emulate: viewport\.width: Too small: expected number to be >0/,
        ],
        [
          {pageId: 1, viewport: '1280.5x720'},
          /^Input validation error: Invalid arguments for tool emulate: viewport\.width: Expected an integer$/,
        ],
        [
          {pageId: 1, viewport: '1280x720,bogus'},
          /^Input validation error: Invalid arguments for tool emulate: viewport: Invalid viewport option "bogus"\. Expected "mobile", "touch", or "landscape" in '<width>x<height>x<devicePixelRatio>\[,mobile\]\[,touch\]\[,landscape\]'\.$/,
        ],
        [
          {pageId: 1, extraHttpHeaders: 'notjson'},
          /^Input validation error: Invalid arguments for tool emulate: extraHttpHeaders: Invalid JSON for headers:/,
        ],
      ];

      for (const [args, expectedPattern] of cases) {
        const result = await server.callTool('emulate', args);

        assert.strictEqual(result.isError, true);
        assert.strictEqual(result.content.length, 1);
        const firstBlock = result.content[0];
        assert.strictEqual(firstBlock.type, 'text');
        assert.match(firstBlock.text, expectedPattern);
      }
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
      try {
        return (await listServerToolNames(server)).sort();
      } finally {
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

    it('rejects network mocks by default in MCP mode', async () => {
      const {server, browserManager} = await createTestServer();
      const names = await listServerToolNames(server);
      assert.ok(names.includes('list_network_requests'));
      for (const name of ['mock_network', 'remove_network_mock']) {
        assert.strictEqual(names.includes(name), false);
        const result = await server.callTool(name, {pageId: 1});
        assert.strictEqual(result.isError, true);
        const content = result.content[0];
        assert.strictEqual(content.type, 'text');
        assert.match(content.text, /--categoryNetworkMocks=true/);
      }
      sinon.assert.notCalled(browserManager.ensureBrowser);
      await server.close();
    });

    it('enables network mocks by default in CLI mode', async () => {
      const {server, context} = await createTestServer(['--viaCli']);
      const names = await listServerToolNames(server);
      assert.ok(names.includes('mock_network'));
      assert.ok(names.includes('remove_network_mock'));
      await server.callTool('mock_network', {pageId: 1});
      sinon.assert.calledOnce(context.ensureBrowser);
      await server.close();
    });

    it('rejects network mocks in CLI mode when explicitly disabled', async () => {
      const {server, browserManager} = await createTestServer([
        '--viaCli',
        '--no-category-network-mocks',
      ]);
      const names = await listServerToolNames(server);
      for (const name of ['mock_network', 'remove_network_mock']) {
        assert.strictEqual(names.includes(name), true);
        const result = await server.callTool(name, {pageId: 1});
        assert.strictEqual(result.isError, true);
        const content = result.content[0];
        assert.strictEqual(content.type, 'text');
        assert.match(content.text, /--categoryNetworkMocks=true/);
      }
      sinon.assert.notCalled(browserManager.ensureBrowser);
      await server.close();
    });

    it('enables network mocks independently of network inspection', async () => {
      const names = await listToolNames([
        '--categoryNetworkMocks',
        '--categoryNetwork=false',
      ]);
      assert.ok(names.includes('mock_network'));
      assert.ok(names.includes('remove_network_mock'));
      assert.ok(!names.includes('list_network_requests'));
      assert.ok(!names.includes('get_network_request'));
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
    it('keeps maxNavigationSaved unchanged when configuration is reloaded', async () => {
      const {server, config, browserManager} = await createTestServer([
        '--maxNavigationSaved=5',
      ]);

      await server.applyConfig(parseConfig(['--maxNavigationSaved=10']));

      assert.strictEqual(config.resolved.maxNavigationSaved, 5);
      sinon.assert.notCalled(browserManager.ensureBrowser);
      await server.close();
    });

    it('enables tools that were disabled', async () => {
      const {server} = await createTestServer();
      assert.ok(
        !(await listServerToolNames(server)).includes(
          'get_heapsnapshot_summary',
        ),
      );

      await server.applyConfig(parseConfig(['--memoryDebugging']));

      assert.ok(
        (await listServerToolNames(server)).includes(
          'get_heapsnapshot_summary',
        ),
      );
    });

    it('toggles slim mode', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseConfig(['--slim']));

      const slimToolNames = await listServerToolNames(server);
      assert.ok(!slimToolNames.includes('navigate_page'));
      assert.ok(slimToolNames.includes('navigate'));
    });

    it('disables tools that were enabled', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseConfig(['--no-category-network']));

      assert.ok(
        !(await listServerToolNames(server)).includes('list_network_requests'),
      );
    });

    it('updates the listed tool schema when options change', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseConfig(['--no-page-id-routing']));

      const tools = await listServerTools(server);
      const consoleTool = tools.find(
        tool => tool.name === 'list_console_messages',
      );
      assert.ok(consoleTool);
      assert.ok(!('pageId' in (consoleTool.inputSchema.properties ?? {})));
    });

    it('uses the new arguments for tool calls', async () => {
      const {server, browserManager} = await createTestServer();

      await server.applyConfig(parseConfig(['--no-javascript-evaluation']));
      const result = await server.callTool('evaluate_script', {
        function: '() => 1',
        pageId: 1,
      });

      assert.strictEqual(result.isError, true);
      const firstBlock = result.content[0];
      assert.strictEqual(firstBlock.type, 'text');
      assert.match(firstBlock.text, /requires flag --javascriptEvaluation/);
      sinon.assert.notCalled(browserManager.ensureBrowser);
    });

    it('validates MCP tool calls queued behind applyConfig against the updated config', async () => {
      const {server, context} = await createTestServer();
      const client = await connectClient(server);

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
        const firstBlock = content[0];
        assert.strictEqual(firstBlock.type, 'text');
        assert.match(
          firstBlock.text,
          /^Input validation error: Invalid arguments for tool list_console_messages: .*pageId/,
        );
      } finally {
        await client.close();
      }
    });

    it('commits the shared config, updates roots, and notifies the context with previous args', async () => {
      const {server, context, config} = await createTestServer([
        '--chromeArg=--foo',
      ]);
      await server.callTool('list_pages');
      const previousArgs = config.resolved;
      let cruxWhenNotified: boolean | undefined;
      context.onConfigChanged.callsFake(async () => {
        cruxWhenNotified = config.resolved.performanceCrux;
      });
      const rootPath = path.resolve('/tmp/reloaded-workspace');

      await server.applyConfig(
        parseConfig(['--no-performance-crux', `--workspace=${rootPath}`]),
      );

      sinon.assert.calledWithExactly(context.setRoots.secondCall, [
        {
          uri: pathToFileURL(rootPath).href,
          name: 'reloaded-workspace',
        },
      ]);
      sinon.assert.calledOnceWithExactly(context.onConfigChanged, previousArgs);
      assert.strictEqual(cruxWhenNotified, false);
      assert.deepStrictEqual(config.resolved.chromeArg, ['--foo']);
    });

    it('logs the CrUX disclaimer only when CrUX becomes active', async () => {
      const {server} = await createTestServer(['--no-performance-crux']);
      const defaultConfig = parseConfig();
      const errorStub = sinon.stub(console, 'error');

      await server.applyConfig(defaultConfig);

      sinon.assert.calledOnceWithExactly(
        errorStub,
        'Performance tools may send trace URLs to the Google CrUX API to fetch real-user experience data. To disable, run with --no-performance-crux.',
      );

      await server.applyConfig(defaultConfig);

      sinon.assert.calledOnce(errorStub);
    });

    for (const enabled of [false, true]) {
      it(`requires a restart to change network mocks from ${enabled}`, async () => {
        const {server, config} = await createTestServer([
          `--categoryNetworkMocks=${enabled}`,
        ]);
        const next = parseConfig([`--categoryNetworkMocks=${!enabled}`]);
        assert.deepStrictEqual(config.getRestartRequiredChanges(next), [
          'categoryNetworkMocks',
        ]);

        await server.applyConfig(next);

        const names = await listServerToolNames(server);
        assert.strictEqual(names.includes('mock_network'), enabled);
        assert.strictEqual(names.includes('remove_network_mock'), enabled);
        assert.strictEqual(config.resolved.categoryNetworkMocks, enabled);
        await server.close();
      });
    }

    it('keeps restart-required options the server was started with', async () => {
      const {server} = await createTestServer();

      await server.applyConfig(parseConfig(['--categoryExtensions']));

      assert.ok(
        !(await listServerToolNames(server)).includes('install_extension'),
      );
    });

    it('notifies the client only when a tool changed', async () => {
      const {server} = await createTestServer();
      const sendToolListChanged = sinon.spy(
        server.server,
        'sendToolListChanged',
      );

      await server.applyConfig(parseConfig());
      sinon.assert.notCalled(sendToolListChanged);

      await server.applyConfig(parseConfig(['--memoryDebugging']));
      sinon.assert.called(sendToolListChanged);
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

  describe('watchConfig', () => {
    async function watchTestServer(configPath: string) {
      const logStream = sinon.createStubInstance(fs.WriteStream);
      sinon.stub(fs, 'createWriteStream').returns(logStream);
      saveLogsToFile('test.log');
      let watchListener: fs.WatchListener<string> | undefined;
      const watchStub = sinon
        .stub(fs, 'watch')
        .callsFake(
          (
            filename: fs.PathLike,
            options?:
              | fs.WatchOptions
              | BufferEncoding
              | fs.WatchListener<string>
              | null,
            listener?: fs.WatchListener<string>,
          ) => {
            assert.ok(listener);
            watchListener = listener;
            return watchStub.wrappedMethod(filename, () => {}).unref();
          },
        );
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const {server, context, config} = await createTestServer([
        '--config',
        configPath,
      ]);
      server.watchConfig();
      logStream.write.resetHistory();

      async function updateConfigFile(content: string) {
        fs.writeFileSync(configPath, content);
        assert.ok(watchListener);
        watchListener('change', path.basename(configPath));
        await clock.tickAsync(200);
      }

      return {
        server,
        context,
        config,
        logStream,
        updateConfigFile,
        async [Symbol.asyncDispose]() {
          await server.close();
        },
      };
    }

    it('starts watching on connect only when watchConfig is enabled', async () => {
      using configFile = createTempFile('{}', 'cd4a.watch.connect.json');
      const watchConfigSpy = sinon.spy(McpServer.prototype, 'watchConfig');
      const startStub = sinon.stub(ConfigWatcher.prototype, 'start');
      sinon.stub(ConfigWatcher.prototype, 'dispose');

      const {server: disabledServer} = await createTestServer(
        ['--config', configFile.path],
        {mockContext: false},
      );
      const [, disabledTransport] = InMemoryTransport.createLinkedPair();
      await disabledServer.connect(disabledTransport);
      sinon.assert.notCalled(watchConfigSpy);
      sinon.assert.notCalled(startStub);
      await disabledServer.close();

      const {server: enabledServer} = await createTestServer(
        ['--config', configFile.path, '--watchConfig'],
        {mockContext: false},
      );
      const [, enabledTransport] = InMemoryTransport.createLinkedPair();
      await enabledServer.connect(enabledTransport);
      sinon.assert.calledOnceWithExactly(watchConfigSpy);
      sinon.assert.calledOnceWithExactly(startStub);
      await enabledServer.close();
    });

    it('does not start a watcher when no config file was resolved', async () => {
      const startStub = sinon.stub(ConfigWatcher.prototype, 'start');
      const {server} = await createTestServer();
      const consoleError = sinon.stub(console, 'error');

      server.watchConfig();

      sinon.assert.notCalled(startStub);
      sinon.assert.calledOnceWithExactly(
        consoleError,
        '--watchConfig has no effect because no config file was found.',
      );
    });

    it('logs an error and disposes the watcher when starting the watcher fails', async () => {
      using configFile = createTempFile('{}', 'cd4a.watch.error.json');
      sinon
        .stub(ConfigWatcher.prototype, 'start')
        .throws(new Error('watch limit reached'));
      const disposeStub = sinon.stub(ConfigWatcher.prototype, 'dispose');
      const {server} = await createTestServer(['--config', configFile.path]);
      const consoleError = sinon.stub(console, 'error');

      server.watchConfig();

      sinon.assert.calledOnceWithExactly(disposeStub);
      sinon.assert.calledOnceWithExactly(
        consoleError,
        `Failed to watch ${configFile.path}: watch limit reached`,
      );
    });

    it('disposes the previous watcher when called again and on close', async () => {
      using configFile = createTempFile('{}', 'cd4a.watch.lifecycle.json');
      const startStub = sinon.stub(ConfigWatcher.prototype, 'start');
      const disposeStub = sinon.stub(ConfigWatcher.prototype, 'dispose');
      const {server} = await createTestServer(['--config', configFile.path]);

      server.watchConfig();
      sinon.assert.calledOnceWithExactly(startStub);
      sinon.assert.notCalled(disposeStub);

      server.watchConfig();
      sinon.assert.calledTwice(startStub);
      sinon.assert.calledOnceWithExactly(disposeStub);

      await server.close();
      sinon.assert.calledTwice(disposeStub);

      await server.close();
      sinon.assert.calledTwice(disposeStub);
    });

    it('applies reloadable config changes when the config file changes', async () => {
      using configFile = createTempFile(
        JSON.stringify({memoryDebugging: false}),
        'cd4a.watch.reloadable.json',
      );
      await using watched = await watchTestServer(configFile.path);
      const consoleError = sinon.stub(console, 'error');

      await watched.updateConfigFile(JSON.stringify({memoryDebugging: true}));

      assert.strictEqual(watched.config.resolved.memoryDebugging, true);
      assert.ok(
        (await listServerToolNames(watched.server)).includes(
          'get_heapsnapshot_summary',
        ),
      );
      sinon.assert.notCalled(consoleError);
    });

    it('does not apply a queued reload after the server is closed', async () => {
      using configFile = createTempFile(
        JSON.stringify({memoryDebugging: false}),
        'cd4a.watch.closed.json',
      );
      await using watched = await watchTestServer(configFile.path);
      const {promise: toolBrowser, resolve: releaseToolCall} =
        Promise.withResolvers<ReturnType<typeof createMockPuppeteerBrowser>>();
      const {promise: toolEntered, resolve: markToolEntered} =
        Promise.withResolvers<void>();
      watched.context.ensureBrowser.onFirstCall().callsFake(async () => {
        markToolEntered();
        return await toolBrowser;
      });

      const toolCall = watched.server.callTool('list_pages');
      await toolEntered;

      const reloadPromise = watched.updateConfigFile(
        JSON.stringify({memoryDebugging: true}),
      );
      await watched.server.close();
      releaseToolCall(createMockPuppeteerBrowser());
      await toolCall;
      await reloadPromise;

      assert.strictEqual(watched.config.resolved.memoryDebugging, false);
      sinon.assert.notCalled(watched.context.onConfigChanged);
    });

    it('logs a restart notice when restart-required options change', async () => {
      using configFile = createTempFile(
        JSON.stringify({
          headless: false,
          memoryDebugging: false,
        }),
        'cd4a.watch.restart.json',
      );
      await using watched = await watchTestServer(configFile.path);
      const consoleError = sinon.stub(console, 'error');

      await watched.updateConfigFile(
        JSON.stringify({
          headless: true,
          memoryDebugging: true,
          categoryExtensions: true,
        }),
      );

      assert.strictEqual(watched.config.resolved.memoryDebugging, true);
      assert.strictEqual(watched.config.resolved.headless, false);
      assert.strictEqual(watched.config.resolved.categoryExtensions, undefined);
      const expectedNotice = `Restart chrome-devtools-mcp to fully apply changes to --categoryExtensions, --headless from ${configFile.path}.`;
      sinon.assert.calledOnceWithExactly(consoleError, expectedNotice);
      sinon.assert.calledTwice(watched.logStream.write);
      sinon.assert.calledWithMatch(
        watched.logStream.write.firstCall,
        `Applied config changes from ${configFile.path}\n`,
      );
      sinon.assert.calledWithMatch(
        watched.logStream.write.secondCall,
        `${expectedNotice}\n`,
      );
    });

    it('keeps the previous configuration when reloading the config file fails', async () => {
      using configFile = createTempFile(
        JSON.stringify({memoryDebugging: true}),
        'cd4a.watch.invalid.json',
      );
      await using watched = await watchTestServer(configFile.path);
      const consoleError = sinon.stub(console, 'error');

      await watched.updateConfigFile('[]');

      assert.strictEqual(watched.config.resolved.memoryDebugging, true);
      sinon.assert.notCalled(watched.context.onConfigChanged);
      const expectedError = `Keeping the previous configuration, failed to reload ${configFile.path}: Invalid JSON config file: Config must be a JSON object`;
      sinon.assert.calledOnceWithExactly(consoleError, expectedError);
      sinon.assert.calledOnceWithMatch(
        watched.logStream.write,
        `${expectedError}\n`,
      );
    });

    it('keeps the previous configuration when reloaded options conflict with startup options', async () => {
      using configFile = createTempFile(
        JSON.stringify({browserUrl: 'http://127.0.0.1:9222'}),
        'cd4a.watch.conflict.json',
      );
      await using watched = await watchTestServer(configFile.path);
      const consoleError = sinon.stub(console, 'error');

      await watched.updateConfigFile(JSON.stringify({categoryPwa: true}));

      assert.strictEqual(watched.config.resolved.categoryPwa, undefined);
      sinon.assert.notCalled(watched.context.onConfigChanged);
      const expectedError = `Keeping the previous configuration, failed to reload ${configFile.path}: Arguments categoryPwa and browserUrl are mutually exclusive`;
      sinon.assert.calledOnceWithExactly(consoleError, expectedError);
      sinon.assert.calledOnceWithMatch(
        watched.logStream.write,
        `${expectedError}\n`,
      );
    });

    it('does not log keeping the previous configuration when applying committed config fails', async () => {
      using configFile = createTempFile(
        JSON.stringify({memoryDebugging: false}),
        'cd4a.watch.apply-error.json',
      );
      await using watched = await watchTestServer(configFile.path);
      await watched.server.callTool('list_pages');
      watched.logStream.write.resetHistory();
      const applyError = new Error('failed to update pages');
      watched.context.onConfigChanged.rejects(applyError);
      const consoleError = sinon.stub(console, 'error');

      await watched.updateConfigFile(JSON.stringify({memoryDebugging: true}));

      assert.strictEqual(watched.config.resolved.memoryDebugging, true);
      sinon.assert.calledOnceWithExactly(
        consoleError,
        `Failed to apply ${configFile.path}:`,
        applyError,
      );
      sinon.assert.notCalled(watched.logStream.write);
    });
  });

  describe('idleTimeout', () => {
    it('closes the browser after idleTimeout elapses following a tool call', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const {server, browserManager, context} = await createTestServer([
        '--idleTimeout=1s',
      ]);

      await server.callTool('list_pages', {});
      await clock.tickAsync(999);
      sinon.assert.notCalled(context.onBrowserClosed);
      sinon.assert.notCalled(browserManager.close);

      await clock.tickAsync(1);
      sinon.assert.calledOnceWithExactly(
        context.releaseScreencasts,
        'the browser was idle',
      );
      sinon.assert.calledOnceWithExactly(
        context.releasePerformanceTrace,
        'the browser was idle',
      );
      sinon.assert.calledOnceWithExactly(context.onBrowserClosed);
      sinon.assert.calledOnceWithExactly(browserManager.close);
      sinon.assert.callOrder(
        context.releaseScreencasts,
        context.releasePerformanceTrace,
        context.onBrowserClosed,
        browserManager.close,
      );
      await server.close();
    });

    it('stops and saves an active screencast recording before closing the idle browser', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const pptrPage = createMockPuppeteerPage();
      const target = createMockPuppeteerTarget({page: pptrPage});
      const browser = createMockPuppeteerBrowser();
      browser.targets.returns([target]);
      const browserManager = sinon.createStubInstance(BrowserManager);
      browserManager.ensureBrowser.resolves(browser);
      browserManager.close.resolves();
      const createContextSpy = sinon.spy(McpContext, 'create');

      const server = await McpServer.from(parseConfig(['--idleTimeout=1s']), {
        browserManager,
      });
      await server.callTool('list_pages', {});
      const realContext = createContextSpy.firstCall.returnValue;
      const [mcpPage] = realContext.getPages();
      assert.ok(mcpPage);

      const {promise: recorderStopped, resolve: finishRecorderStop} =
        Promise.withResolvers<void>();
      const recorder = sinon.createStubInstance(ScreenRecorder);
      recorder.stop.returns(recorderStopped);
      mcpPage.setScreenRecorder({recorder, filePath: '/tmp/idle-video.mp4'});

      await clock.tickAsync(1_000);
      sinon.assert.calledOnceWithExactly(recorder.stop);
      sinon.assert.notCalled(browserManager.close);

      finishRecorderStop();
      await clock.tickAsync(0);
      assert.strictEqual(mcpPage.getScreenRecorder(), null);
      sinon.assert.calledOnceWithExactly(browserManager.close);
      await server.close();
    });

    it('stops a running performance trace before closing the idle browser', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const pptrPage = createMockPuppeteerPage();
      const target = createMockPuppeteerTarget({page: pptrPage});
      const browser = createMockPuppeteerBrowser();
      browser.targets.returns([target]);
      const browserManager = sinon.createStubInstance(BrowserManager);
      browserManager.ensureBrowser.resolves(browser);
      browserManager.close.resolves();
      const createContextSpy = sinon.spy(McpContext, 'create');

      const server = await McpServer.from(parseConfig(['--idleTimeout=1s']), {
        browserManager,
      });
      await server.callTool('list_pages', {});
      const realContext = createContextSpy.firstCall.returnValue;
      const [mcpPage] = realContext.getPages();
      assert.ok(mcpPage);

      const {promise: traceStopped, resolve: finishTraceStop} =
        Promise.withResolvers<Uint8Array<ArrayBuffer>>();
      pptrPage.tracing.stop.returns(traceStopped);
      mcpPage.setIsRunningPerformanceTrace(true);

      await clock.tickAsync(1_000);
      sinon.assert.calledOnceWithExactly(pptrPage.tracing.stop);
      sinon.assert.notCalled(browserManager.close);

      finishTraceStop(new Uint8Array());
      await clock.tickAsync(0);
      assert.strictEqual(realContext.isRunningPerformanceTrace(), false);
      sinon.assert.calledOnceWithExactly(browserManager.close);
      await server.close();
    });

    it('cancels a waiting idle pause when a new tool call starts so other page queues are not blocked', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const pptrPage1 = createMockPuppeteerPage();
      const pptrPage2 = createMockPuppeteerPage();
      const browser = createMockPuppeteerBrowser();
      browser.targets.returns([
        createMockPuppeteerTarget({page: pptrPage1}),
        createMockPuppeteerTarget({page: pptrPage2}),
      ]);
      const browserManager = sinon.createStubInstance(BrowserManager);
      browserManager.ensureBrowser.resolves(browser);
      browserManager.close.resolves();
      const createContextSpy = sinon.spy(McpContext, 'create');

      const server = await McpServer.from(parseConfig(['--idleTimeout=1s']), {
        browserManager,
      });
      const client = await connectClient(server);
      const {promise: stuckInit, resolve: releaseStuckPage1} =
        Promise.withResolvers<void>();
      try {
        await client.callTool({name: 'list_pages', arguments: {}});
        const realContext = createContextSpy.firstCall.returnValue;
        const [page1, page2] = realContext.getPages();
        assert.ok(page1);
        assert.ok(page2);

        const {promise: page1Entered, resolve: markPage1Entered} =
          Promise.withResolvers<void>();
        sinon.stub(page1, 'init').callsFake(async () => {
          markPage1Entered();
          await stuckInit;
        });

        const call1Controller = new AbortController();
        const call1 = client.callTool(
          {name: 'list_console_messages', arguments: {pageId: page1.id}},
          {signal: call1Controller.signal},
        );
        await page1Entered;
        call1Controller.abort();
        await assert.rejects(call1);

        // Let the idle timer fire while page1 still holds its page queue.
        await clock.tickAsync(1_000);

        const page2Result = await server.callTool('list_console_messages', {
          pageId: page2.id,
        });
        assert.strictEqual(page2Result.isError, undefined);
        sinon.assert.notCalled(browserManager.close);
      } finally {
        releaseStuckPage1();
        await clock.tickAsync(0);
        await client.close();
        await server.close();
      }
    });

    it('does not close while an MCP tool call is in flight and restarts the countdown when it finishes', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const {server, browserManager, context} = await createTestServer([
        '--idleTimeout=1s',
      ]);
      const client = await connectClient(server);
      try {
        const {promise: browserReady, resolve: finishBrowser} =
          Promise.withResolvers<
            ReturnType<typeof createMockPuppeteerBrowser>
          >();
        const {promise: entered, resolve: markEntered} =
          Promise.withResolvers<void>();
        context.ensureBrowser.callsFake(async () => {
          markEntered();
          return await browserReady;
        });

        const call = client.callTool({name: 'list_pages', arguments: {}});
        await entered;
        await clock.tickAsync(5_000);
        sinon.assert.notCalled(context.onBrowserClosed);
        sinon.assert.notCalled(browserManager.close);

        finishBrowser(createMockPuppeteerBrowser());
        await call;
        await clock.tickAsync(999);
        sinon.assert.notCalled(context.onBrowserClosed);
        sinon.assert.notCalled(browserManager.close);

        await clock.tickAsync(1);
        sinon.assert.calledOnceWithExactly(context.onBrowserClosed);
        sinon.assert.calledOnceWithExactly(browserManager.close);
      } finally {
        await client.close();
        await server.close();
      }
    });

    it('resets the countdown when another tool call runs before the timeout', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const {server, browserManager, context} = await createTestServer([
        '--idleTimeout=1s',
      ]);

      await server.callTool('list_pages', {});
      await clock.tickAsync(900);
      await server.callTool('list_pages', {});
      await clock.tickAsync(999);
      sinon.assert.notCalled(context.onBrowserClosed);
      sinon.assert.notCalled(browserManager.close);

      await clock.tickAsync(1);
      sinon.assert.calledOnceWithExactly(context.onBrowserClosed);
      sinon.assert.calledOnceWithExactly(browserManager.close);
      await server.close();
    });

    it('aborts closing when a new tool call arrives while waiting for the task runner', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const {server, browserManager, context} = await createTestServer([
        '--idleTimeout=1s',
      ]);

      await server.callTool('list_pages', {});

      const {promise: configDone, resolve: finishConfig} =
        Promise.withResolvers<void>();
      const {promise: configEntered, resolve: markConfigEntered} =
        Promise.withResolvers<void>();
      context.onConfigChanged.callsFake(async () => {
        markConfigEntered();
        await configDone;
      });

      const reload = server.applyConfig(parseConfig());
      await configEntered;

      await clock.tickAsync(1_000);
      const nextCall = server.callTool('list_pages', {});
      finishConfig();
      await reload;
      await nextCall;

      sinon.assert.notCalled(context.onBrowserClosed);
      sinon.assert.notCalled(browserManager.close);

      await clock.tickAsync(1_000);
      sinon.assert.calledOnceWithExactly(context.onBrowserClosed);
      sinon.assert.calledOnceWithExactly(browserManager.close);
      await server.close();
    });

    it('does not fire after server.close()', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const {server, browserManager, context} = await createTestServer([
        '--idleTimeout=1s',
      ]);

      await server.callTool('list_pages', {});
      await server.close();
      browserManager.close.resetHistory();

      await clock.tickAsync(5_000);
      sinon.assert.notCalled(context.onBrowserClosed);
      sinon.assert.notCalled(browserManager.close);
    });

    it('does not close the browser when idleTimeout is not configured', async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const {server, browserManager, context} = await createTestServer();

      await server.callTool('list_pages', {});
      await clock.tickAsync(60_000);

      assert.strictEqual(clock.countTimers(), 0);
      sinon.assert.notCalled(context.onBrowserClosed);
      sinon.assert.notCalled(browserManager.close);
      await server.close();
    });
  });
});

async function getToolsWithFilteredCategories(
  filterOutCategories: ToolCategory[] = [],
): Promise<string[]> {
  const files = fs.readdirSync(
    path.resolve(import.meta.dirname, '../src/tools'),
  );
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
