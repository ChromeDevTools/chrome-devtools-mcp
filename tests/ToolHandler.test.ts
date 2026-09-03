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

import {parseArguments} from '../src/config/mcp-options.js';
import {McpContext} from '../src/McpContext.js';
import {McpPage} from '../src/McpPage.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';
import {zod} from '../src/third_party/index.js';
import {ToolHandler} from '../src/ToolHandler.js';
import {ToolCategory} from '../src/tools/categories.js';
import type {
  DefinedPageTool,
  DevToolsData,
  ToolDefinition,
} from '../src/tools/ToolDefinition.js';
import {createTools} from '../src/tools/tools.js';
import {getMockBrowser} from './utils.js';
import {Mutex} from '../src/third_party/index.js';

describe('ToolHandler', () => {
  afterEach(() => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

  it('calls getPageById for page scoped tools when pageId is provided', async () => {
    let handlerCalled = false;
    const tool: DefinedPageTool = {
      name: 'page_tool',
      description: 'A page scoped tool',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      pageScoped: true,
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.browser = getMockBrowser({process: mockProcess});
    const mockPage = sinon.createStubInstance(McpPage);
    mockContext.getPageById.returns(mockPage);

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
    );

    assert.strictEqual(toolHandler.disabled, false);
    await toolHandler.handle({pageId: 1});

    assert.strictEqual(mockContext.getPageById.calledOnce, true);
    assert.strictEqual(mockContext.getPageById.calledWith(1), true);
    assert.strictEqual(handlerCalled, true);
  });

  it('calls getSelectedMcpPage for page scoped tools when pageIdRouting is disabled', async () => {
    let handlerCalled = false;
    const tool: DefinedPageTool = {
      name: 'page_tool',
      description: 'A page scoped tool',
      annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
      },
      schema: {},
      blockedByDialog: false,
      verifyFilesSchema: {},
      pageScoped: true,
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.browser = getMockBrowser({process: mockProcess});
    const mockPage = sinon.createStubInstance(McpPage);
    mockContext.getSelectedMcpPage.returns(mockPage);

    const toolMutex = new Mutex();
    const serverArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--no-page-id-routing'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
    );

    assert.strictEqual(toolHandler.disabled, false);
    await toolHandler.handle({});

    assert.strictEqual(mockContext.getSelectedMcpPage.calledOnce, true);
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
    mockContext.browser = getMockBrowser({process: mockProcess});

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
    );

    assert.strictEqual(toolHandler.disabled, false);
    const result = await toolHandler.handle({});

    assert.strictEqual(mockContext.getDevToolsData.calledOnce, true);
    assert.strictEqual(mockContext.getSelectedMcpPageUrl.calledOnce, true);
    assert.strictEqual(mockContext.getPageById.called, false);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(result.isError, undefined);
  });

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

    const testCases: Array<{
      tool: ToolDefinition | DefinedPageTool;
      devToolsData: DevToolsData;
      pageUrl?: string;
    }> = [
      {
        tool: {
          ...baseTool,
          name: 'page_tool',
          pageScoped: true,
        },
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
      mockContext.browser = getMockBrowser({process: mockProcess});
      mockContext.getDevToolsData.resolves(testCase.devToolsData);
      if (testCase.pageUrl) {
        mockContext.getSelectedMcpPageUrl.returns(testCase.pageUrl);
      }

      const logSpy = sinon.spy();
      sinon.stub(ClearcutLogger, 'get').returns({
        logToolInvocation: logSpy,
      } as unknown as ClearcutLogger);

      const toolMutex = new Mutex();
      const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
      });

      const toolHandler = new ToolHandler(
        testCase.tool,
        serverArgs,
        async () => mockContext,
        toolMutex,
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

  it('reports unknown registered tool arguments clearly', async () => {
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'lenient_tool',
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
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
    );

    const params = {url: 'https://example.com', description: 'open the page'};
    assert.strictEqual(
      toolHandler.registeredInputSchema.safeParse(params).success,
      true,
    );

    const result = await toolHandler.handle(params);

    assert.strictEqual(result.isError, true);
    assert.match(
      result.content[0].type === 'text' ? result.content[0].text : '',
      /Unknown argument for tool "lenient_tool": "description"\. Expected arguments: "url"\./,
    );
    assert.strictEqual(handlerCalled, false);
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
    const serverArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--categoryEmulation=false'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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

    const defaultServerArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });
    const defaultTool = createTools(defaultServerArgs).find(
      t => t.name === 'evaluate_script',
    );
    if (!defaultTool) {
      assert.fail('evaluate_script not found');
    }
    const defaultHandler = new ToolHandler(
      defaultTool,
      defaultServerArgs,
      async () => mockContext,
      toolMutex,
    );
    assert.strictEqual(defaultHandler.disabled, false);

    const disabledServerArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--no-javascript-evaluation'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );
    const disabledTool = createTools(disabledServerArgs).find(
      t => t.name === 'evaluate_script',
    );
    if (!disabledTool) {
      assert.fail('evaluate_script not found');
    }
    const disabledHandler = new ToolHandler(
      disabledTool,
      disabledServerArgs,
      async () => mockContext,
      toolMutex,
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

    const cliServerArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--no-javascript-evaluation', '--viaCli'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );
    const cliTool = createTools(cliServerArgs).find(
      t => t.name === 'evaluate_script',
    );
    if (!cliTool) {
      assert.fail('evaluate_script not found');
    }
    const cliHandler = new ToolHandler(
      cliTool,
      cliServerArgs,
      async () => mockContext,
      toolMutex,
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

    const defaultServerArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--slim'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );
    const defaultTool = createTools(defaultServerArgs).find(
      t => t.name === 'evaluate',
    );
    if (!defaultTool) {
      assert.fail('evaluate not found');
    }
    const defaultHandler = new ToolHandler(
      defaultTool,
      defaultServerArgs,
      async () => mockContext,
      toolMutex,
    );
    assert.strictEqual(defaultHandler.disabled, false);

    const disabledServerArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--slim', '--javascriptEvaluation=false'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );
    const disabledTool = createTools(disabledServerArgs).find(
      t => t.name === 'evaluate',
    );
    if (!disabledTool) {
      assert.fail('evaluate not found');
    }
    const disabledHandler = new ToolHandler(
      disabledTool,
      disabledServerArgs,
      async () => mockContext,
      toolMutex,
    );
    assert.strictEqual(disabledHandler.disabled, true);
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
        fileList: true,
      },
      handler: async request => {
        handlerCalled = true;
        receivedParams = request.params;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.browser = getMockBrowser({process: mockProcess});
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
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
    mockContext.browser = getMockBrowser({process: mockProcess});
    mockContext.validatePath.rejects(
      new Error('Access denied: path is outside roots'),
    );

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
    mockContext.browser = getMockBrowser({process: mockProcess});
    const canonicalPath = path.resolve('/canonical/workspace/upload.png');
    mockContext.validatePath.resolves(canonicalPath);

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
    mockContext.browser = getMockBrowser({
      wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/test',
    });
    const canonicalBundlePath = path.resolve('/canonical/workspace/app.swbn');
    mockContext.validatePath.resolves(canonicalBundlePath);

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
    mockContext.browser = getMockBrowser({
      wsEndpoint: 'ws://remote-host.com:9222/devtools/browser/test',
    });

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
    mockContext.browser = getMockBrowser();

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
        },
      },
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.browser = getMockBrowser({process: mockProcess});

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
    );

    const result = await toolHandler.handle({
      installUrlOrBundleUrl: 'https://example.com/app',
    });

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(mockContext.validatePath.called, false);
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
    mockContext.browser = getMockBrowser({
      wsEndpoint: 'ws://remote-host.com:9222/devtools/browser/test',
    });
    const canonicalOutputPath = path.resolve('/canonical/output.json');
    mockContext.validatePath.resolves(canonicalOutputPath);

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
    mockContext.browser = getMockBrowser({process: mockProcess});
    mockContext.validatePath.rejects(
      new Error('Path is outside configured roots'),
    );

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    // Remote browser: should validate
    const mockRemoteContext = sinon.createStubInstance(McpContext);
    mockRemoteContext.browser = getMockBrowser({
      wsEndpoint: 'ws://remote-host.com:9222/devtools/browser/test',
    });
    mockRemoteContext.validatePath.resolves();

    const remoteToolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockRemoteContext,
      toolMutex,
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
    mockLocalContext.browser = getMockBrowser({process: mockProcess});

    const localToolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockLocalContext,
      toolMutex,
    );

    await localToolHandler.handle({remoteFile: remotePath});
    assert.strictEqual(mockLocalContext.validatePath.called, false);
  });

  it('rewrites file paths in params for page scoped tools', async () => {
    let receivedParams: Record<string, unknown> | undefined;
    const tool: DefinedPageTool = {
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
      pageScoped: true,
      handler: async request => {
        receivedParams = request.params;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.browser = getMockBrowser({process: mockProcess});
    mockContext.getDevToolsData.resolves({});
    const mockPage = sinon.createStubInstance(McpPage);
    mockPage.getDialog.returns(undefined);
    sinon.stub(mockPage, 'networkConditions').get(() => undefined);
    sinon.stub(mockPage, 'geolocation').get(() => undefined);
    sinon.stub(mockPage, 'viewport').get(() => undefined);
    sinon.stub(mockPage, 'userAgent').get(() => undefined);
    sinon.stub(mockPage, 'colorScheme').get(() => undefined);
    sinon.stub(mockPage, 'cpuThrottlingRate').get(() => 1);
    mockContext.getSelectedMcpPage.returns(mockPage);
    const canonicalFilePath = path.resolve('/canonical/output.png');
    mockContext.validatePath.resolves(canonicalFilePath);

    const toolMutex = new Mutex();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
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
});
