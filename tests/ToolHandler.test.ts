/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {ChildProcess} from 'node:child_process';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import sinon from 'sinon';

import {ConfigParser} from '../src/config/ConfigParser.js';
import {McpContext} from '../src/McpContext.js';
import {McpPage} from '../src/McpPage.js';
import {McpResponse, type DataFormat} from '../src/McpResponse.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';
import {
  Mutex,
  ProtocolError,
  ProtocolErrorCode,
  zod,
} from '../src/third_party/index.js';
import {TOOL_CALL_TIMEOUT_MS, ToolHandler} from '../src/ToolHandler.js';
import {ToolCategory} from '../src/tools/categories.js';
import {
  defineBrowserlessTool,
  definePageTool,
  type BrowserlessToolDefinition,
  type DefinedPageTool,
  type DevToolsData,
  type ToolDefinition,
} from '../src/tools/ToolDefinition.js';
import {evaluateScript} from '../src/tools/script.js';
import {createTools} from '../src/tools/tools.js';
import {createMockMcpContext} from './mocks.js';
import {getMockBrowser} from './utils.js';

describe('ToolHandler', () => {
  afterEach(() => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

  function parseConfig(argv: string[] = []) {
    return new ConfigParser('1.0.0', ['node', 'script.js', ...argv], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    }).parseConfig();
  }

  it('calls getPageById for page scoped tools when pageId is provided', async () => {
    let handlerCalled = false;
    const config = parseConfig();
    const tool = definePageTool(() => ({
      name: 'page_tool',
      description: 'A page scoped tool',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      handler: async () => {
        handlerCalled = true;
      },
    }))(config.resolved);

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));
    const mockPage = sinon.createStubInstance(McpPage);
    mockContext.getPageById.returns(mockPage);

    const toolMutex = new Mutex();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    assert.strictEqual(toolHandler.disabled, false);
    await toolHandler.handle({pageId: 1});

    sinon.assert.calledOnceWithExactly(mockContext.getPageById, 1);
    sinon.assert.calledOnceWithExactly(mockPage.init);
    assert.strictEqual(handlerCalled, true);
  });

  it('calls getSelectedMcpPage for page scoped tools when pageIdRouting is disabled', async () => {
    let handlerCalled = false;
    const config = parseConfig(['--no-page-id-routing']);
    const tool = definePageTool(() => ({
      name: 'page_tool',
      description: 'A page scoped tool',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      handler: async () => {
        handlerCalled = true;
      },
    }))(config.resolved);

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));
    const mockPage = sinon.createStubInstance(McpPage);
    mockContext.getSelectedMcpPage.returns(mockPage);

    const toolMutex = new Mutex();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    assert.strictEqual(toolHandler.disabled, false);
    await toolHandler.handle({});

    sinon.assert.calledOnceWithExactly(mockContext.getSelectedMcpPage);
    sinon.assert.calledOnceWithExactly(mockPage.init);
    assert.strictEqual(handlerCalled, true);
  });

  it('does not pass page to handler for non-page scoped tools', async () => {
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'global_tool',
      description: 'A global tool',
      annotations: {
        category: ToolCategory.NAVIGATION,
        readOnlyHint: true,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    assert.strictEqual(toolHandler.disabled, false);
    const result = await toolHandler.handle({});

    assert.strictEqual(mockContext.getDevToolsData.calledOnce, true);
    assert.strictEqual(mockContext.getSelectedMcpPageUrl.calledOnce, true);
    assert.strictEqual(mockContext.getPageById.called, false);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(result.isError, undefined);
  });

  const dataFormatCases: Array<{argv: string[]; expected: DataFormat}> = [
    {argv: [], expected: 'default'},
    {argv: ['--experimentalToonFormat'], expected: 'toon'},
    {argv: ['--experimentalDataFormat=gcf'], expected: 'gcf'},
    {
      argv: ['--experimentalToonFormat', '--experimentalDataFormat=default'],
      expected: 'default',
    },
    {
      argv: ['--experimentalToonFormat', '--experimentalDataFormat=gcf'],
      expected: 'gcf',
    },
  ];
  for (const {argv, expected} of dataFormatCases) {
    it(`resolves data format ${expected} from [${argv.join(' ')}]`, async () => {
      const tool: ToolDefinition = {
        name: 'global_tool',
        description: 'A global tool',
        annotations: {
          category: ToolCategory.NAVIGATION,
          readOnlyHint: true,
        },
        schema: {},
        blockedByDialog: false,
        verifyFilesSchema: {},
        handler: async () => undefined,
      };
      const mockContext = sinon.createStubInstance(McpContext);
      mockContext.ensureBrowser.resolves(
        getMockBrowser({
          process: sinon.createStubInstance(ChildProcess),
        }),
      );
      const handleStub = sinon
        .stub(McpResponse.prototype, 'handle')
        .resolves({content: [], structuredContent: {}});
      const config = parseConfig(argv);

      await new ToolHandler(
        tool,
        config,
        async () => mockContext,
        new Mutex(),
        sinon.spy(),
      ).handle({});

      sinon.assert.calledOnceWithExactly(handleStub, mockContext, expected);
    });
  }

  it('passes devToolsData and pageUrl to logger', async () => {
    const baseTool: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      annotations: {
        category: ToolCategory.NAVIGATION,
        readOnlyHint: true,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      handler: async () => {
        return;
      },
    };

    const config = parseConfig(['--no-page-id-routing']);

    const testCases: Array<{
      tool: ToolDefinition | DefinedPageTool;
      devToolsData: DevToolsData;
      pageUrl?: string;
    }> = [
      {
        tool: definePageTool(() => ({
          ...baseTool,
          name: 'page_tool',
        }))(config.resolved),
        devToolsData: {cdpBackendNodeId: 1},
        pageUrl: 'http://localhost:9222/',
      },
      {
        tool: {
          ...baseTool,
          name: 'global_tool',
        },
        devToolsData: {},
        pageUrl: undefined,
      },
    ];

    for (const testCase of testCases) {
      let handlerCalled = false;
      testCase.tool.handler = async () => {
        handlerCalled = true;
      };

      const mockContext = sinon.createStubInstance(McpContext);
      const mockProcess = sinon.createStubInstance(ChildProcess);
      mockContext.ensureBrowser.resolves(
        getMockBrowser({process: mockProcess}),
      );
      mockContext.getDevToolsData.resolves(testCase.devToolsData);
      if (testCase.pageUrl) {
        mockContext.getSelectedMcpPageUrl.returns(testCase.pageUrl);
      }

      const logSpy = sinon.spy();
      sinon.stub(ClearcutLogger, 'get').returns({
        logToolInvocation: logSpy,
      } as unknown as ClearcutLogger);

      const toolMutex = new Mutex();

      const toolHandler = new ToolHandler(
        testCase.tool,
        config,
        async () => mockContext,
        toolMutex,
        sinon.spy(),
      );

      await toolHandler.handle({});

      assert.strictEqual(logSpy.calledOnce, true);
      assert.deepStrictEqual(
        logSpy.firstCall.args[0].devToolsData,
        testCase.devToolsData,
      );
      assert.strictEqual(logSpy.firstCall.args[0].pageUrl, testCase.pageUrl);
      assert.strictEqual(handlerCalled, true);

      sinon.restore();
      ClearcutLogger.resetForTesting();
    }
  });

  it('rejects unknown registered tool arguments and sets additionalProperties to false', () => {
    const tool: ToolDefinition = {
      name: 'strict_tool',
      description: 'A tool with a required argument',
      annotations: {
        category: ToolCategory.NAVIGATION,
        readOnlyHint: true,
      },
      schema: {
        url: zod.string(),
      },
      blockedByDialog: false,
      verifyFilesSchema: {},
      handler: async () => {
        return;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const params = {
      url: 123,
      description: 'open the page',
      extra: true,
    };
    const parseResult = toolHandler.registeredInputSchema.safeParse(params);
    assert.strictEqual(parseResult.success, false);
    assert.strictEqual(parseResult.error.issues.length, 2);
    assert.deepStrictEqual(
      parseResult.error.issues.map(issue => issue.message),
      [
        'Invalid input: expected string, received number',
        'Unrecognized keys: "description", "extra"',
      ],
    );

    const jsonSchema = zod.toJSONSchema(toolHandler.registeredInputSchema, {
      io: 'input',
    });
    assert.strictEqual(jsonSchema.additionalProperties, false);
  });

  it('sets disabled to true and returns disabled reason when category is disabled', async () => {
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'disabled_tool',
      description: 'A disabled tool',
      annotations: {
        category: ToolCategory.EMULATION,
        readOnlyHint: true,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const toolMutex = new Mutex();
    const config = parseConfig(['--categoryEmulation=false']);

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    assert.strictEqual(toolHandler.disabled, true);

    const result = await toolHandler.handle({});
    assert.strictEqual(result.isError, true);
    assert.match(
      result.content[0].type === 'text' ? result.content[0].text : '',
      /is currently disabled/,
    );
    assert.strictEqual(handlerCalled, false);
  });

  it('registers evaluate_script by default and disables it when javascriptEvaluation is false', async () => {
    const mockContext = sinon.createStubInstance(McpContext);
    const toolMutex = new Mutex();

    const defaultConfig = parseConfig();
    const defaultTool = createTools(defaultConfig.resolved).find(
      t => t.name === 'evaluate_script',
    );
    if (!defaultTool) {
      assert.fail('evaluate_script not found');
    }
    const defaultHandler = new ToolHandler(
      defaultTool,
      defaultConfig,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );
    assert.strictEqual(defaultHandler.disabled, false);

    const disabledConfig = parseConfig(['--no-javascript-evaluation']);
    const disabledTool = createTools(disabledConfig.resolved).find(
      t => t.name === 'evaluate_script',
    );
    if (!disabledTool) {
      assert.fail('evaluate_script not found');
    }
    const disabledHandler = new ToolHandler(
      disabledTool,
      disabledConfig,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );
    assert.strictEqual(disabledHandler.disabled, true);

    const disabledResult = await disabledHandler.handle({function: '() => 1'});
    assert.strictEqual(disabledResult.isError, true);
    assert.match(
      disabledResult.content[0].type === 'text'
        ? disabledResult.content[0].text
        : '',
      /Tool evaluate_script requires flag --javascriptEvaluation and is currently disabled/,
    );

    const cliConfig = parseConfig(['--no-javascript-evaluation', '--viaCli']);
    const cliTool = createTools(cliConfig.resolved).find(
      t => t.name === 'evaluate_script',
    );
    if (!cliTool) {
      assert.fail('evaluate_script not found');
    }
    const cliHandler = new ToolHandler(
      cliTool,
      cliConfig,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );
    assert.strictEqual(cliHandler.disabled, false);
    const cliResult = await cliHandler.handle({function: '() => 1'});
    assert.strictEqual(cliResult.isError, true);
    assert.match(
      cliResult.content[0].type === 'text' ? cliResult.content[0].text : '',
      /Tool evaluate_script requires flag --javascriptEvaluation and is currently disabled/,
    );
  });

  it('disables slim evaluate tool when javascriptEvaluation is false', async () => {
    const mockContext = sinon.createStubInstance(McpContext);
    const toolMutex = new Mutex();

    const defaultConfig = parseConfig(['--slim']);
    const defaultTool = createTools(defaultConfig.resolved).find(
      t => t.name === 'evaluate',
    );
    if (!defaultTool) {
      assert.fail('evaluate not found');
    }
    const defaultHandler = new ToolHandler(
      defaultTool,
      defaultConfig,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );
    assert.strictEqual(defaultHandler.disabled, false);

    const disabledConfig = parseConfig([
      '--slim',
      '--javascriptEvaluation=false',
    ]);
    const disabledTool = createTools(disabledConfig.resolved).find(
      t => t.name === 'evaluate',
    );
    if (!disabledTool) {
      assert.fail('evaluate not found');
    }
    const disabledHandler = new ToolHandler(
      disabledTool,
      disabledConfig,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );
    assert.strictEqual(disabledHandler.disabled, true);
  });

  describe('slim mode', () => {
    function createHandler(toolName: string, argv: string[]) {
      const config = parseConfig(argv);
      const tool = createTools(config.resolved).find(t => t.name === toolName);
      if (!tool) {
        assert.fail(`${toolName} not found`);
      }
      return new ToolHandler(
        tool,
        config,
        async () => sinon.createStubInstance(McpContext),
        new Mutex(),
        sinon.spy(),
      );
    }

    it('disables slim tools without --slim', async () => {
      const handler = createHandler('navigate', []);

      assert.strictEqual(handler.disabled, true);
      const result = await handler.handle({url: 'https://example.com'});
      assert.strictEqual(result.isError, true);
      assert.deepStrictEqual(result.content, [
        {type: 'text', text: 'Tool navigate is only available with --slim.'},
      ]);
    });

    it('disables non-slim tools with --slim', async () => {
      const handler = createHandler('navigate_page', ['--slim']);

      assert.strictEqual(handler.disabled, true);
      const result = await handler.handle({url: 'https://example.com'});
      assert.strictEqual(result.isError, true);
      assert.deepStrictEqual(result.content, [
        {
          type: 'text',
          text: 'Tool navigate_page is not available with --slim.',
        },
      ]);
    });

    it('enables slim tools with --slim', () => {
      assert.strictEqual(createHandler('navigate', ['--slim']).disabled, false);
    });

    it('disables tools from the other mode even via CLI', () => {
      assert.strictEqual(
        createHandler('navigate', ['--viaCli']).disabled,
        true,
      );
    });
  });

  it('validates files specified in verifyFilesSchema and rewrites input with validated paths/URLs', async () => {
    let handlerCalled = false;
    let receivedParams: Record<string, unknown> | undefined;
    const tool: ToolDefinition = {
      name: 'file_tool',
      description: 'A tool requiring file validation',
      annotations: {
        category: ToolCategory.PERFORMANCE,
        readOnlyHint: true,
      },
      schema: {
        filePath: zod.string(),
        fileList: zod.array(zod.string()),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePath: true,
        // allowUrl lets a remote URL pass through unchanged (file/plain paths
        // are still validated); this is what source-map/PWA-style params use.
        fileList: {local: true, remote: true, allowUrl: true},
      },
      handler: async request => {
        handlerCalled = true;
        receivedParams = request.params;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));
    mockContext.validatePath.callsFake(async p => {
      if (!p) {
        return undefined;
      }
      return path.resolve(
        '/canonical',
        path.relative(path.resolve('/workspace'), p),
      );
    });

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const testFile = path.resolve('/workspace/url-file.txt');
    const testFileUrl = pathToFileURL(testFile).href;
    const testListFile1 = path.resolve('/workspace/list1.txt');
    const testListFile2 = path.resolve('/workspace/list2.txt');

    const result = await toolHandler.handle({
      filePath: testFileUrl,
      fileList: [
        testListFile1,
        testListFile2,
        'https://example.com/remote.txt',
      ],
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(mockContext.validatePath.callCount, 3);
    assert.strictEqual(mockContext.validatePath.calledWith(testFile), true);
    assert.strictEqual(
      mockContext.validatePath.calledWith(testListFile1),
      true,
    );
    assert.strictEqual(
      mockContext.validatePath.calledWith(testListFile2),
      true,
    );
    assert.deepStrictEqual(receivedParams, {
      filePath: pathToFileURL(path.resolve('/canonical/url-file.txt')).href,
      fileList: [
        path.resolve('/canonical/list1.txt'),
        path.resolve('/canonical/list2.txt'),
        'https://example.com/remote.txt',
      ],
    });
  });

  it('returns error when file validation fails for verifyFilesSchema', async () => {
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'file_tool',
      description: 'A tool requiring file validation',
      annotations: {
        category: ToolCategory.PERFORMANCE,
        readOnlyHint: true,
      },
      schema: {
        filePath: zod.string(),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePath: true,
      },
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));
    mockContext.validatePath.rejects(
      new Error('Access denied: path is outside roots'),
    );

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const result = await toolHandler.handle({
      filePath: '/outside/workspace/file.txt',
    });

    assert.strictEqual(result.isError, true);
    assert.match(
      result.content[0].type === 'text' ? result.content[0].text : '',
      /Access denied/,
    );
    assert.strictEqual(handlerCalled, false);
  });

  it('validates evaluate_script sourcePath before reading the file', async () => {
    const config = parseConfig();
    const tool = evaluateScript(config.resolved);
    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));
    mockContext.validatePath.rejects(
      new Error('Access denied: path is outside roots'),
    );

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      new Mutex(),
      sinon.spy(),
    );
    const sourcePath = path.resolve('/outside/workspace/script.js');

    const result = await toolHandler.handle({sourcePath, pageId: 1});

    assert.strictEqual(result.isError, true);
    assert.match(
      result.content[0].type === 'text' ? result.content[0].text : '',
      /Access denied/,
    );
    sinon.assert.calledOnceWithExactly(mockContext.validatePath, sourcePath);
    sinon.assert.notCalled(mockContext.loadResource);
  });

  it('validates verifyFilesSchema when local: true and browser is running locally via process', async () => {
    let handlerCalled = false;
    let receivedParams: Record<string, unknown> | undefined;
    const tool: ToolDefinition = {
      name: 'upload_tool',
      description: 'A tool with local-only file verification',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {
        filePaths: zod.array(zod.string()),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePaths: {
          local: true,
          remote: false,
        },
      },
      handler: async request => {
        handlerCalled = true;
        receivedParams = request.params;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));
    const canonicalPath = path.resolve('/canonical/workspace/upload.png');
    mockContext.validatePath.resolves(canonicalPath);

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const testPath = path.resolve('/workspace/upload.png');
    const result = await toolHandler.handle({
      filePaths: [testPath],
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(mockContext.validatePath.calledOnceWith(testPath), true);
    assert.deepStrictEqual(receivedParams, {
      filePaths: [canonicalPath],
    });
  });

  it('validates verifyFilesSchema when local: true and browser is connected to localhost wsEndpoint', async () => {
    let handlerCalled = false;
    let receivedParams: Record<string, unknown> | undefined;
    const tool: ToolDefinition = {
      name: 'install_pwa_tool',
      description: 'PWA tool with local-only file verification',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {
        installUrlOrBundleUrl: zod.string(),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        installUrlOrBundleUrl: {
          local: true,
        },
      },
      handler: async request => {
        handlerCalled = true;
        receivedParams = request.params;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    mockContext.ensureBrowser.resolves(
      getMockBrowser({
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/test',
      }),
    );
    const canonicalBundlePath = path.resolve('/canonical/workspace/app.swbn');
    mockContext.validatePath.resolves(canonicalBundlePath);

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const bundlePath = path.resolve('/workspace/app.swbn');
    const fileUrl = pathToFileURL(bundlePath).href;
    const result = await toolHandler.handle({
      installUrlOrBundleUrl: fileUrl,
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(
      mockContext.validatePath.calledOnceWith(bundlePath),
      true,
    );
    assert.deepStrictEqual(receivedParams, {
      installUrlOrBundleUrl: pathToFileURL(canonicalBundlePath).href,
    });
  });

  it('skips local-only verifyFilesSchema when browser is remote', async () => {
    let handlerCalled = false;
    let receivedParams: Record<string, unknown> | undefined;
    const tool: ToolDefinition = {
      name: 'upload_tool',
      description: 'A tool with local-only file verification',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {
        filePaths: zod.array(zod.string()),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePaths: {
          local: true,
          remote: false,
        },
      },
      handler: async request => {
        handlerCalled = true;
        receivedParams = request.params;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    mockContext.ensureBrowser.resolves(
      getMockBrowser({
        wsEndpoint: 'ws://remote-host.com:9222/devtools/browser/test',
      }),
    );

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const result = await toolHandler.handle({
      filePaths: ['/remote/server/path.txt'],
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(mockContext.validatePath.called, false);
    assert.deepStrictEqual(receivedParams, {
      filePaths: ['/remote/server/path.txt'],
    });
  });

  it('skips local-only verifyFilesSchema when browser has no process', async () => {
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'upload_tool',
      description: 'A tool with local-only file verification',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {
        filePaths: zod.array(zod.string()),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePaths: {
          local: true,
        },
      },
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    mockContext.ensureBrowser.resolves(getMockBrowser());

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const result = await toolHandler.handle({
      filePaths: ['/path/to/upload.txt'],
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(mockContext.validatePath.called, false);
  });

  it('skips non-file URLs for local-only verifyFilesSchema even on local browser', async () => {
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'install_pwa_tool',
      description: 'PWA tool with local-only file verification',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {
        installUrlOrBundleUrl: zod.string(),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        installUrlOrBundleUrl: {
          local: true,
          allowUrl: true,
        },
      },
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const result = await toolHandler.handle({
      installUrlOrBundleUrl: 'https://example.com/app',
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(mockContext.validatePath.called, false);
  });

  it('rejects an http/ws URL for a filesystem-path parameter when allowUrl is not set, even on a local browser', async () => {
    // Regression test for the allowUrl TSDoc in ToolDefinition.ts: a filesystem-path parameter must reject a value that merely parses as an http/ws URL instead of passing it through.
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'upload_tool',
      description: 'A local-only file sink without allowUrl',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {
        filePaths: zod.array(zod.string()),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePaths: {
          local: true,
          remote: false,
        },
      },
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const traversalUrl = 'http://x/' + '../'.repeat(12) + 'etc/passwd';
    const result = await toolHandler.handle({filePaths: [traversalUrl]});

    assert.strictEqual(result.isError, true);
    assert.strictEqual(handlerCalled, false);
    sinon.assert.notCalled(mockContext.validatePath);
    assert.strictEqual(
      result.content[0].type === 'text' ? result.content[0].text : '',
      'Error: This parameter expects a file path, not a URL.',
    );
  });

  it('validates verifyFilesSchema with true but skips local: true on remote browser', async () => {
    let handlerCalled = false;
    let receivedParams: Record<string, unknown> | undefined;
    const tool: ToolDefinition = {
      name: 'hybrid_tool',
      description: 'A tool with both schema file verifications',
      annotations: {
        category: ToolCategory.PERFORMANCE,
        readOnlyHint: false,
      },
      schema: {
        outputFile: zod.string(),
        inputFile: zod.string(),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        outputFile: true,
        inputFile: {
          local: true,
          remote: false,
        },
      },
      handler: async request => {
        handlerCalled = true;
        receivedParams = request.params;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    mockContext.ensureBrowser.resolves(
      getMockBrowser({
        wsEndpoint: 'ws://remote-host.com:9222/devtools/browser/test',
      }),
    );
    const canonicalOutputPath = path.resolve('/canonical/output.json');
    mockContext.validatePath.resolves(canonicalOutputPath);

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const outputPath = path.resolve('/local/output.json');
    const result = await toolHandler.handle({
      outputFile: outputPath,
      inputFile: '/remote/input.json',
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(
      mockContext.validatePath.calledOnceWith(outputPath),
      true,
    );
    assert.deepStrictEqual(receivedParams, {
      outputFile: canonicalOutputPath,
      inputFile: '/remote/input.json',
    });
  });

  it('returns error when file validation fails for local: true on local browser', async () => {
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'upload_tool',
      description: 'A tool with local-only file verification',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {
        filePaths: zod.array(zod.string()),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePaths: {
          local: true,
          remote: false,
        },
      },
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));
    mockContext.validatePath.rejects(
      new Error('Path is outside configured roots'),
    );

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const result = await toolHandler.handle({
      filePaths: ['/forbidden/path.txt'],
    });

    assert.strictEqual(result.isError, true);
    assert.match(
      result.content[0].type === 'text' ? result.content[0].text : '',
      /Path is outside configured roots/,
    );
    assert.strictEqual(handlerCalled, false);
  });

  it('validates remote: true on remote browser and skips on local browser', async () => {
    const tool: ToolDefinition = {
      name: 'remote_file_tool',
      description: 'A tool with remote-only file verification',
      annotations: {
        category: ToolCategory.PERFORMANCE,
        readOnlyHint: false,
      },
      schema: {
        remoteFile: zod.string(),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        remoteFile: {
          local: false,
          remote: true,
        },
      },
      handler: async () => {
        // no-op
      },
    };

    const toolMutex = new Mutex();
    const config = parseConfig();

    // Remote browser: should validate
    const mockRemoteContext = sinon.createStubInstance(McpContext);
    mockRemoteContext.ensureBrowser.resolves(
      getMockBrowser({
        wsEndpoint: 'ws://remote-host.com:9222/devtools/browser/test',
      }),
    );
    mockRemoteContext.validatePath.resolves();

    const remoteToolHandler = new ToolHandler(
      tool,
      config,
      async () => mockRemoteContext,
      toolMutex,
      sinon.spy(),
    );

    const remotePath = path.resolve('/remote/file.txt');
    await remoteToolHandler.handle({remoteFile: remotePath});
    assert.strictEqual(
      mockRemoteContext.validatePath.calledOnceWith(remotePath),
      true,
    );

    // Local browser: should skip
    const mockLocalContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockLocalContext.ensureBrowser.resolves(
      getMockBrowser({process: mockProcess}),
    );

    const localToolHandler = new ToolHandler(
      tool,
      config,
      async () => mockLocalContext,
      toolMutex,
      sinon.spy(),
    );

    await localToolHandler.handle({remoteFile: remotePath});
    assert.strictEqual(mockLocalContext.validatePath.called, false);
  });

  it('rewrites file paths in params for page scoped tools', async () => {
    let receivedParams: Record<string, unknown> | undefined;
    const config = parseConfig(['--no-page-id-routing']);
    const tool = definePageTool(() => ({
      name: 'page_file_tool',
      description: 'A page scoped tool with file verification',
      annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
      },
      schema: {
        filePath: zod.string(),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePath: true,
      },
      handler: async request => {
        receivedParams = request.params;
      },
    }))(config.resolved);

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));
    mockContext.getDevToolsData.resolves({});
    const mockPage = sinon.createStubInstance(McpPage);
    mockPage.getDialog.returns(undefined);
    sinon.stub(mockPage, 'networkConditions').get(() => undefined);
    sinon.stub(mockPage, 'geolocation').get(() => undefined);
    sinon.stub(mockPage, 'viewport').get(() => undefined);
    sinon.stub(mockPage, 'userAgent').get(() => undefined);
    sinon.stub(mockPage, 'colorScheme').get(() => undefined);
    sinon.stub(mockPage, 'forcedColors').get(() => undefined);
    sinon.stub(mockPage, 'prefersContrast').get(() => undefined);
    sinon.stub(mockPage, 'prefersReducedMotion').get(() => undefined);
    sinon.stub(mockPage, 'cpuThrottlingRate').get(() => 1);
    mockContext.getSelectedMcpPage.returns(mockPage);
    const canonicalFilePath = path.resolve('/canonical/output.png');
    mockContext.validatePath.resolves(canonicalFilePath);

    const toolMutex = new Mutex();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const inputPath = path.resolve('/workspace/output.png');
    const result = await toolHandler.handle({
      filePath: inputPath,
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(
      mockContext.validatePath.calledOnceWith(inputPath),
      true,
    );
    assert.deepStrictEqual(receivedParams, {
      filePath: canonicalFilePath,
    });
  });

  it('skips validation and clears empty or whitespace-only file paths in params', async () => {
    let receivedParams: Record<string, unknown> | undefined;
    const tool: ToolDefinition = {
      name: 'file_tool',
      description: 'A tool with file verification',
      annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
      },
      schema: {
        filePath: zod.string().optional(),
        filePaths: zod.array(zod.string()).optional(),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePath: true,
        filePaths: true,
      },
      handler: async request => {
        receivedParams = request.params;
      },
    };

    const mockContext = createMockMcpContext();
    mockContext.ensureBrowser.resolves(getMockBrowser());
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      new Mutex(),
      sinon.spy(),
    );

    const result = await toolHandler.handle({
      filePath: '     ',
      filePaths: ['   ', ''],
    });

    assert.strictEqual(result.isError, undefined);
    sinon.assert.notCalled(mockContext.validatePath);
    assert.deepStrictEqual(receivedParams, {
      filePath: undefined,
      filePaths: [],
    });
  });

  it('does not cut off a slow tool handler on a healthy browser', async () => {
    const tool: ToolDefinition = {
      name: 'slow_tool',
      description: 'A tool whose handler legitimately outlasts the timeout',
      annotations: {
        category: ToolCategory.NAVIGATION,
        readOnlyHint: true,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      handler: async (_request, response) => {
        // Simulates valid slow work, e.g. wait_for with a long timeout or
        // evaluate_script awaiting a slow promise.
        await new Promise<void>(resolve => {
          setTimeout(resolve, TOOL_CALL_TIMEOUT_MS * 2);
        });
        response.appendResponseLine('done');
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.ensureBrowser.resolves(getMockBrowser({process: mockProcess}));

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      sinon.spy(),
    );

    const clock = sinon.useFakeTimers();
    try {
      const resultPromise = toolHandler.handle({});
      await clock.tickAsync(TOOL_CALL_TIMEOUT_MS * 2);
      const result = await resultPromise;

      assert.strictEqual(result.isError, undefined);
      assert.strictEqual(
        result.content[0].type === 'text' ? result.content[0].text : '',
        'done',
      );
    } finally {
      clock.restore();
    }
  });

  it('times out when ensureBrowser() hangs, and abandons the pending connect', async () => {
    const tool: ToolDefinition = {
      name: 'hanging_context_tool',
      description: 'A tool whose browser connection never resolves',
      annotations: {
        category: ToolCategory.NAVIGATION,
        readOnlyHint: true,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      handler: async () => {
        // Never reached: the timeout fires while still awaiting ensureBrowser().
      },
    };

    const mockContext = createMockMcpContext();
    mockContext.ensureBrowser.returns(
      new Promise(() => {
        // Simulates BrowserManager#ensureBrowser() hanging on a half-open
        // socket: it never resolves or rejects on its own.
      }),
    );
    const abandonPendingBrowserAttemptSpy = sinon.spy();

    const toolMutex = new Mutex();
    const config = parseConfig();

    const toolHandler = new ToolHandler(
      tool,
      config,
      async () => mockContext,
      toolMutex,
      abandonPendingBrowserAttemptSpy,
    );

    const clock = sinon.useFakeTimers();
    try {
      const resultPromise = toolHandler.handle({});
      await clock.tickAsync(TOOL_CALL_TIMEOUT_MS);
      const result = await resultPromise;

      assert.strictEqual(result.isError, true);
      assert.match(
        result.content[0].type === 'text' ? result.content[0].text : '',
        /timed out/,
      );
      sinon.assert.calledOnce(abandonPendingBrowserAttemptSpy);
    } finally {
      clock.restore();
    }
  });

  describe('browserless tools', () => {
    function createBrowserlessTool(
      handler: BrowserlessToolDefinition['handler'],
    ) {
      return defineBrowserlessTool(() => ({
        name: 'browserless_tool',
        description: 'A tool that does not need a browser',
        annotations: {
          category: ToolCategory.MEMORY,
          readOnlyHint: true,
        },
        schema: {
          filePath: zod.string(),
        },
        blockedByDialog: false,
        verifyFilesSchema: {filePath: true},
        handler,
      }))(parseConfig().resolved);
    }

    it('runs without establishing a browser connection', async () => {
      const handler = sinon.stub().resolves();
      const mockContext = createMockMcpContext();
      mockContext.validatePath.resolves('/canonical/file.heapsnapshot');
      const handleStub = sinon
        .stub(McpResponse.prototype, 'handle')
        .resolves({content: [], structuredContent: {}});

      const result = await new ToolHandler(
        createBrowserlessTool(handler),
        parseConfig(),
        async () => mockContext,
        new Mutex(),
        sinon.spy(),
      ).handle({filePath: 'file.heapsnapshot'});

      assert.strictEqual(result.isError, undefined);
      sinon.assert.notCalled(mockContext.ensureBrowser);
      sinon.assert.notCalled(mockContext.consumeReconnectNotice);
      sinon.assert.notCalled(mockContext.getDevToolsData);
      sinon.assert.calledOnceWithExactly(
        mockContext.validatePath,
        'file.heapsnapshot',
      );
      sinon.assert.calledOnceWithExactly(
        handler,
        {params: {filePath: '/canonical/file.heapsnapshot'}},
        sinon.match.instanceOf(McpResponse),
        mockContext,
      );
      sinon.assert.calledOnceWithExactly(handleStub, mockContext, 'default');
    });
  });

  describe('update', () => {
    function createGlobalTool(
      schema: zod.ZodRawShape,
      handler: ToolDefinition['handler'],
    ): ToolDefinition {
      return {
        name: 'global_tool',
        description: 'A global tool',
        annotations: {
          category: ToolCategory.NAVIGATION,
          readOnlyHint: true,
        },
        schema,
        blockedByDialog: false,
        verifyFilesSchema: {},
        handler,
      };
    }

    it('applies to calls that wait for the mutex', async () => {
      const config = parseConfig();
      const handler = sinon.stub().resolves();
      const tool = createGlobalTool({}, handler);
      const toolMutex = new Mutex();
      const toolHandler = new ToolHandler(
        tool,
        config,
        async () => createMockMcpContext(),
        toolMutex,
        sinon.spy(),
      );

      await toolMutex.acquire();
      const call = toolHandler.handle({});
      config.commit(parseConfig(['--no-category-navigation']));
      toolHandler.update(tool);
      toolMutex.release();
      const result = await call;

      assert.strictEqual(result.isError, true);
      assert.match(
        result.content[0]?.type === 'text' ? result.content[0].text : '',
        /is currently disabled/,
      );
      sinon.assert.notCalled(handler);
    });

    it('validates waiting calls against the updated schema', async () => {
      const config = parseConfig();
      const handler = sinon.stub().resolves();
      const toolMutex = new Mutex();
      const toolHandler = new ToolHandler(
        createGlobalTool({a: zod.string().optional()}, handler),
        config,
        async () => createMockMcpContext(),
        toolMutex,
        sinon.spy(),
      );

      await toolMutex.acquire();
      const call = toolHandler.handle({a: 'value'});
      toolHandler.update(
        createGlobalTool(
          {a: zod.string().optional(), b: zod.string()},
          handler,
        ),
      );
      toolMutex.release();
      const result = await call;

      assert.strictEqual(result.isError, true);
      assert.match(
        result.content[0]?.type === 'text' ? result.content[0].text : '',
        /^Input validation error: Invalid arguments for tool global_tool: b:/,
      );
      sinon.assert.notCalled(handler);
    });

    it('runs waiting calls that satisfy the updated schema', async () => {
      const config = parseConfig();
      const handler = sinon.stub().resolves();
      const toolMutex = new Mutex();
      const mockContext = createMockMcpContext();
      mockContext.ensureBrowser.resolves(getMockBrowser());
      const toolHandler = new ToolHandler(
        createGlobalTool({a: zod.string()}, handler),
        config,
        async () => mockContext,
        toolMutex,
        sinon.spy(),
      );

      await toolMutex.acquire();
      const call = toolHandler.handle({a: 'value', b: 'extra'});
      toolHandler.update(
        createGlobalTool({a: zod.string(), b: zod.string()}, handler),
      );
      toolMutex.release();
      const result = await call;

      assert.strictEqual(result.isError, undefined);
      sinon.assert.calledOnce(handler);
    });

    it('throws ProtocolError when a waiting MCP call becomes disabled', async () => {
      const config = parseConfig();
      const handler = sinon.stub().resolves();
      const tool = createGlobalTool({}, handler);
      const toolMutex = new Mutex();
      const toolHandler = new ToolHandler(
        tool,
        config,
        async () => createMockMcpContext(),
        toolMutex,
        sinon.spy(),
      );

      await toolMutex.acquire();
      const call = toolHandler.handle({}, {viaMcp: true});
      config.commit(parseConfig(['--no-category-navigation']));
      toolHandler.update(tool);
      toolMutex.release();

      await assert.rejects(call, (error: unknown) => {
        assert.ok(error instanceof ProtocolError);
        assert.strictEqual(error.code, ProtocolErrorCode.InvalidParams);
        assert.strictEqual(error.message, 'Tool global_tool disabled');
        return true;
      });
      sinon.assert.notCalled(handler);
    });

    it('runs waiting calls when the schema is unchanged', async () => {
      const config = parseConfig();
      const handler = sinon.stub().resolves();
      const toolMutex = new Mutex();
      const mockContext = createMockMcpContext();
      mockContext.ensureBrowser.resolves(getMockBrowser());
      const toolHandler = new ToolHandler(
        createGlobalTool({a: zod.string().optional()}, handler),
        config,
        async () => mockContext,
        toolMutex,
        sinon.spy(),
      );

      await toolMutex.acquire();
      const call = toolHandler.handle({a: 'value'});
      config.commit(parseConfig(['--redact-network-headers']));
      const listingChanged = toolHandler.update(
        createGlobalTool({a: zod.string().optional()}, handler),
      );
      toolMutex.release();
      await call;

      assert.strictEqual(listingChanged, false);
      sinon.assert.calledOnce(handler);
    });

    it('updates the disabled state and reports listing change', () => {
      const config = parseConfig();
      const tool = createGlobalTool({}, sinon.stub().resolves());
      const toolHandler = new ToolHandler(
        tool,
        config,
        async () => createMockMcpContext(),
        new Mutex(),
        sinon.spy(),
      );

      config.commit(parseConfig(['--no-category-navigation']));
      const listingChanged = toolHandler.update(tool);

      assert.strictEqual(listingChanged, true);
      assert.strictEqual(toolHandler.disabled, true);
    });
  });
});
