/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {executablePath} from 'puppeteer';

import type {ToolCategory} from '../src/tools/categories.js';
import {OFF_BY_DEFAULT_CATEGORIES} from '../src/tools/categories.js';
import type {ToolDefinition} from '../src/tools/ToolDefinition.js';

describe('e2e', () => {
  async function withClient(
    cb: (client: Client) => Promise<void>,
    extraArgs: string[] = [],
  ) {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [
        'build/src/bin/chrome-devtools-mcp.js',
        '--headless',
        '--isolated',
        '--executable-path',
        executablePath(),
        ...extraArgs,
      ],
    });
    const client = new Client(
      {
        name: 'e2e-test',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    try {
      await client.connect(transport);
      await cb(client);
    } finally {
      await client.close();
    }
  }
  it('calls a tool', async t => {
    await withClient(async client => {
      const result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      t.assert.snapshot?.(JSON.stringify(result.content));
    });
  });

  it('calls a tool multiple times', async t => {
    await withClient(async client => {
      let result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      t.assert.snapshot?.(JSON.stringify(result.content));
    });
  });

  it('has all tools with off by default categories', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const exposedNames = tools.map(t => t.name).sort();
        const definedNames = await getToolsWithFilteredCategories();
        definedNames.sort();
        assert.deepStrictEqual(exposedNames, definedNames);
      },
      OFF_BY_DEFAULT_CATEGORIES.map(category => `--category-${category}`),
    );
  });

  it('has all tools', async () => {
    await withClient(async client => {
      const {tools} = await client.listTools();
      const exposedNames = tools.map(t => t.name).sort();
      const definedNames = await getToolsWithFilteredCategories(
        OFF_BY_DEFAULT_CATEGORIES,
      );
      definedNames.sort();
      assert.deepStrictEqual(exposedNames, definedNames);
    });
  });

  it('has experimental in-Page tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const listInPageTools = tools.find(
          t => t.name === 'list_in_page_tools',
        );
        assert.ok(listInPageTools);
      },
      ['--category-in-page-tools'],
    );
  });

  it('has experimental extensions tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const installExtension = tools.find(
          t => t.name === 'install_extension',
        );
        assert.ok(installExtension);
      },
      ['--category-extensions'],
    );
  });

  it('has experimental vision tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const clickAt = tools.find(t => t.name === 'click_at');
        assert.ok(clickAt);
      },
      ['--experimental-vision'],
    );
  });

  it('has experimental interop tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const getTabId = tools.find(t => t.name === 'get_tab_id');
        assert.ok(getTabId);
      },
      ['--experimental-interop-tools'],
    );
  });

  it('has experimental webmcp', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const listWebMcpTools = tools.find(t => t.name === 'list_webmcp_tools');
        const executeWebMcpTool = tools.find(
          t => t.name === 'execute_webmcp_tool',
        );
        assert.ok(listWebMcpTools);
        assert.ok(executeWebMcpTool);
      },
      ['--experimental-webmcp'],
    );
  });
});

async function getToolsWithFilteredCategories(
  filterOutCategories: ToolCategory[] = [],
): Promise<string[]> {
  const files = fs.readdirSync('build/src/tools');
  const definedNames = [];
  for (const file of files) {
    if (
      file === 'ToolDefinition.js' ||
      file === 'tools.js' ||
      file === 'slim'
    ) {
      continue;
    }
    const fileTools = await import(`../src/tools/${file}`);

    for (const maybeTool of Object.values<unknown>(fileTools)) {
      let tool;
      if (typeof maybeTool === 'function') {
        tool = (maybeTool as (val: boolean) => ToolDefinition)(false);
      } else {
        tool = maybeTool as ToolDefinition;
      }

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
    return true;
  }
  if (
    tool.annotations?.category &&
    filteredOutCategories.includes(tool.annotations?.category)
  ) {
    return true;
  }

  return false;
}
