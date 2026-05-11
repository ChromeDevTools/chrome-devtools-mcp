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
import {Mutex} from '../src/Mutex.js';
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

    assert.strictEqual(mockContext.getSelectedMcpPage.called, false);
    assert.strictEqual(mockContext.getPageById.called, false);
    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(result.isError, undefined);
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
});
