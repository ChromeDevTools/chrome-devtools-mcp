/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {parseArguments} from '../src/bin/chrome-devtools-mcp-cli-options.js';
import {McpContext} from '../src/McpContext.js';
import {McpPage} from '../src/McpPage.js';
import {MutexRegistry} from '../src/Mutex.js';
import {zod} from '../src/third_party/index.js';
import {ToolHandler} from '../src/ToolHandler.js';
import {ToolCategory} from '../src/tools/categories.js';
import type {
  DefinedPageTool,
  ToolDefinition,
} from '../src/tools/ToolDefinition.js';

describe('ToolHandler', () => {
  afterEach(() => {
    sinon.restore();
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
      pageScoped: true,
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockPage = sinon.createStubInstance(McpPage);
    mockContext.getSelectedMcpPage.returns(mockPage);
    mockContext.detectOpenDevToolsWindows.resolves();

    const mutexRegistry = new MutexRegistry();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      mutexRegistry,
    );

    assert.strictEqual(toolHandler.shouldRegister, true);
    await toolHandler.handle({});

    assert.strictEqual(mockContext.getSelectedMcpPage.calledOnce, true);
    assert.strictEqual(handlerCalled, true);
  });

  it('does not call page getter for non-page scoped tools', async () => {
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
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    mockContext.detectOpenDevToolsWindows.resolves();

    const mutexRegistry = new MutexRegistry();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      mutexRegistry,
    );

    assert.strictEqual(toolHandler.shouldRegister, true);
    const result = await toolHandler.handle({});

    assert.strictEqual(mockContext.getSelectedMcpPage.called, false);
    assert.strictEqual(mockContext.getPageById.called, false);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(result.isError, undefined);
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
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    mockContext.detectOpenDevToolsWindows.resolves();

    const mutexRegistry = new MutexRegistry();
    const serverArgs = parseArguments('1.0.0', ['node', 'script.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      mutexRegistry,
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

  it('uses per-page lock for tools whose schema accepts pageId (e.g. evaluate_script via defineTool, not definePageTool)', async () => {
    // Regression test: evaluate_script upstream is registered via
    // defineTool() (so `pageScoped` is undefined) but includes pageId in
    // its native schema when --experimentalPageIdRouting is on. An earlier
    // version of this fork only checked tool.pageScoped, which routed
    // those calls into acquireExclusive() and serialised everything.
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'custom_eval',
      description: 'evaluate_script-like tool defined via defineTool',
      annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
      },
      schema: {
        function: zod.string(),
        pageId: zod.number(),
      },
      blockedByDialog: false,
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mockPage = sinon.createStubInstance(McpPage);
    mockContext.getPageById.returns(mockPage);
    mockContext.detectOpenDevToolsWindows.resolves();

    const mutexRegistry = new MutexRegistry();
    const acquireExclusiveSpy = sinon.spy(mutexRegistry, 'acquireExclusive');
    const forPageSpy = sinon.spy(mutexRegistry, 'forPage');

    const serverArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--experimentalPageIdRouting'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      mutexRegistry,
    );

    await toolHandler.handle({pageId: 5, function: '() => {}'});

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(
      acquireExclusiveSpy.callCount,
      0,
      'should not drop to acquireExclusive for a page-targeted call',
    );
    assert.ok(
      forPageSpy.calledWith(5),
      'should acquire the per-page mutex keyed by the request pageId',
    );
  });

  it('uses exclusive lock for topology tools even when their schema accepts pageId (e.g. close_page)', async () => {
    let handlerCalled = false;
    const tool: ToolDefinition = {
      name: 'close_page',
      description: 'Closes a page by id',
      annotations: {
        category: ToolCategory.NAVIGATION,
        readOnlyHint: false,
      },
      schema: {
        pageId: zod.number(),
      },
      blockedByDialog: false,
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    mockContext.detectOpenDevToolsWindows.resolves();

    const mutexRegistry = new MutexRegistry();
    const acquireExclusiveSpy = sinon.spy(mutexRegistry, 'acquireExclusive');
    const forPageSpy = sinon.spy(mutexRegistry, 'forPage');

    const serverArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--experimentalPageIdRouting'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      mutexRegistry,
    );

    await toolHandler.handle({pageId: 5});

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(
      acquireExclusiveSpy.callCount,
      1,
      'close_page must drain all per-page work via acquireExclusive',
    );
    assert.strictEqual(
      forPageSpy.called,
      false,
      'close_page must not take the per-page lock',
    );
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
      handler: async () => {
        handlerCalled = true;
      },
    };

    const mockContext = sinon.createStubInstance(McpContext);
    const mutexRegistry = new MutexRegistry();
    const serverArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--categoryEmulation=false'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );

    const toolHandler = new ToolHandler(
      tool,
      serverArgs,
      async () => mockContext,
      mutexRegistry,
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
});
