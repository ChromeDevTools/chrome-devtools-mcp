/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListRootsRequestSchema,
  RootsListChangedNotificationSchema,
  type ClientCapabilities,
  type TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import {executablePath} from 'puppeteer';

import type {ToolCategory} from '../src/tools/categories.js';
import {OFF_BY_DEFAULT_CATEGORIES} from '../src/tools/categories.js';
import type {ToolDefinition} from '../src/tools/ToolDefinition.js';

describe('e2e', () => {
  async function withClient(
    cb: (client: Client) => Promise<void>,
    extraArgs: string[] = [],
    options: {capabilities?: ClientCapabilities} = {},
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
      env: {...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    });
    const client = new Client(
      {
        name: 'e2e-test',
        version: '1.0.0',
      },
      {
        capabilities: options.capabilities ?? {},
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

  it('has experimental third-party developer tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const listThirdPartyDeveloperTools = tools.find(
          t => t.name === 'list_3p_developer_tools',
        );
        assert.ok(listThirdPartyDeveloperTools);
      },
      ['--category-experimental-third-party'],
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
      ['--categoryExperimentalWebmcp'],
    );
  });

  it('updates roots when client notifies', async () => {
    const roots = [{uri: 'file:///test-root', name: 'test-root'}];
    let resolvePromise: () => void;
    const promise = new Promise<void>(resolve => {
      resolvePromise = resolve;
    });

    await withClient(
      async client => {
        client.setRequestHandler(ListRootsRequestSchema, () => {
          resolvePromise();
          return {roots};
        });

        await client.notification({
          method: RootsListChangedNotificationSchema.shape.method.value,
        });

        // Wait for the server to process the notification and request roots
        await promise;
      },
      [],
      {
        capabilities: {
          roots: {listChanged: true},
        },
      },
    );
  });

  it('denies file access if roots list is empty', async () => {
    await withClient(
      async client => {
        client.setRequestHandler(ListRootsRequestSchema, () => {
          return {roots: []};
        });

        const result = await client.callTool({
          name: 'take_screenshot',
          arguments: {
            filePath: path.resolve(os.homedir(), 'test.png'),
          },
        });

        assert.strictEqual(result.isError, true);
        const content = result.content as TextContent[];
        assert.match(content[0].text, /Access denied/);
      },
      [],
      {
        capabilities: {
          roots: {listChanged: true},
        },
      },
    );
  });

  it('allows file access if roots capability is missing', async () => {
    await withClient(
      async client => {
        const result = await client.callTool({
          name: 'take_screenshot',
          arguments: {
            filePath: '/tmp/test.png',
          },
        });

        assert.strictEqual(result.isError, undefined);
        const content = result.content as TextContent[];
        assert.match(content[0].text, /Saved screenshot to/);
      },
      [],
      {
        capabilities: {},
      },
    );
  });

  describe('Dialogs', () => {
    async function createNewPageAndTriggerDialog(client: Client) {
      // Navigate to a page with a button that triggers a dialog on click
      await client.callTool({
        name: 'new_page',
        arguments: {
          url: `data:text/html,<button id="test" onclick="alert('test dialog')">Click me</button>`,
        },
      });

      const snapshotResult = await client.callTool({
        name: 'take_snapshot',
        arguments: {},
      });

      const snapshotText = (snapshotResult.content as TextContent[])[0].text;
      const match = snapshotText.match(/uid=(\d+_\d+)\s+button "Click me"/);
      const uid = match ? match[1] : '1_1';

      // Trigger the dialog
      const result = await client.callTool({
        name: 'click',
        arguments: {
          uid,
        },
      });

      return result;
    }

    it('returns blocked message when dialog is opened during tool execution', async t => {
      await withClient(async client => {
        const result = await createNewPageAndTriggerDialog(client);
        t.assert.snapshot?.(JSON.stringify(result));
      });
    });

    it('when dialog is open and tool is blocked, returns an error', async t => {
      await withClient(async client => {
        await createNewPageAndTriggerDialog(client);
        const result = await client.callTool({
          name: 'take_screenshot',
          arguments: {
            filePath: '/tmp/test.png',
          },
        });

        t.assert.snapshot?.(JSON.stringify(result));
      });
    });

    it('when dialog is open and tool is not blocked, executes tool', async t => {
      await withClient(async client => {
        await createNewPageAndTriggerDialog(client);
        const result = await client.callTool({
          name: 'new_page',
          arguments: {
            url: `data:text/html,<h1>New</h1>`,
          },
        });

        t.assert.snapshot?.(JSON.stringify(result));
      });
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
