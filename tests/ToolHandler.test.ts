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

import {parseArguments} from '../src/bin/chrome-devtools-mcp-cli-options.js';
import {McpContext} from '../src/McpContext.js';
import {McpPage} from '../src/McpPage.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';
import {zod} from '../src/third_party/index.js';
import {ToolHandler} from '../src/ToolHandler.js';
import {ToolCategory} from '../src/tools/categories.js';
import type {
  DefinedPageTool,
  ToolDefinition,
} from '../src/tools/ToolDefinition.js';
import {getMockBrowser} from './utils.js';
import {Mutex} from '../src/third_party/index.js';

describe('ToolHandler', () => {
  afterEach(() => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

  it('calls page getter for page scoped tools', async () => {
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
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      toolMutex,
    );

    assert.strictEqual(toolHandler.shouldRegister, true);
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

    assert.strictEqual(toolHandler.shouldRegister, true);
    const result = await toolHandler.handle({});

    assert.strictEqual(mockContext.getDevToolsData.calledOnce, true);
    assert.strictEqual(mockContext.getSelectedMcpPage.calledOnce, true);
    assert.strictEqual(mockContext.getPageById.called, false);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(result.isError, undefined);
  });

  it('appends correct context to tool call logs', async () => {
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
      devToolsData: Record<string, unknown>;
      pageUrl?: string;
      expectedContext: Record<string, unknown>;
    }> = [
      {
        tool: {
          ...baseTool,
          name: 'page_tool',
          pageScoped: true,
        },
        devToolsData: {cdpBackendNodeId: 1},
        pageUrl: 'http://localhost:9222/',
        expectedContext: {
          is_devtools_open: true,
          is_localhost: true,
          devtools_data: {
            is_dom_element_selected: true,
          },
        },
      },
      {
        tool: {
          ...baseTool,
          name: 'global_tool',
        },
        devToolsData: {},
        pageUrl: undefined,
        expectedContext: {
          is_devtools_open: false,
        },
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
        const mockPage = {
          pptrPage: {
            isClosed: () => false,
            url: () => testCase.pageUrl,
          },
        } as unknown as McpPage;
        mockContext.getSelectedMcpPage.returns(mockPage);
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
        logSpy.firstCall.args[0].context,
        testCase.expectedContext,
      );
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

  it('sets shouldRegister to false and returns disabled reason when category is disabled', async () => {
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

    assert.strictEqual(toolHandler.shouldRegister, false);

    const result = await toolHandler.handle({});
    assert.strictEqual(result.isError, true);
    assert.match(
      result.content[0].type === 'text' ? result.content[0].text : '',
      /is currently disabled/,
    );
    assert.strictEqual(handlerCalled, false);
  });

  it('validates files specified in verifyFilesSchema', async () => {
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
        fileList: zod.array(zod.string()),
      },
      blockedByDialog: false,
      verifyFilesSchema: {
        filePath: true,
        fileList: true,
      },
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockProcess = sinon.createStubInstance(ChildProcess);
    mockContext.browser = getMockBrowser({process: mockProcess});
    mockContext.validatePath.resolves();

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
    mockContext.validatePath.resolves();

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
  });

  it('validates verifyFilesSchema when local: true and browser is connected to localhost wsEndpoint', async () => {
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
    mockContext.browser = getMockBrowser({
      wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/test',
    });
    mockContext.validatePath.resolves();

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
  });

  it('skips local-only verifyFilesSchema when browser is remote', async () => {
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
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    mockContext.browser = getMockBrowser({
      wsEndpoint: 'ws://remote-host.com:9222/devtools/browser/test',
    });
    mockContext.validatePath.resolves();

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
});
