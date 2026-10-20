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
import {McpServer} from '../src/index.js';
import {McpContext} from '../src/McpContext.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';
import type {ToolCategory} from '../src/tools/categories.js';
import type {ToolDefinition} from '../src/tools/ToolDefinition.js';
import {saveLogsToFile} from '../src/utils/logger.js';

import {createMockMcpContext, createMockPuppeteerBrowser} from './mocks.js';
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

    it('returns a validation error when transform validation fails', async () => {
      const {server, browserManager} = await createTestServer();
      const cases: Array<[Record<string, unknown>, RegExp]> = [
        [
          {pageId: 1, geolocation: '0x0'},
          /^Input validation error: Invalid arguments for tool emulate: geolocation: Invalid geolocation "0x0"\. Expected '<latitude>,<longitude>'\.$/,
        ],
        [
          {pageId: 1, viewport: '0x0'},
          /^Input validation error: Invalid arguments for tool emulate: viewport: Invalid viewport width "0"\./,
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
        '--blockedUrlPattern',
        'https://example.com/*',
      ]);
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
      assert.deepStrictEqual(config.resolved.blockedUrlPattern, [
        'https://example.com/*',
      ]);
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
