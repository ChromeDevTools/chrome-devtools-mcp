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

describe('e2e', () => {
  async function withClient(cb: (client: Client) => Promise<void>) {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [
        'build/src/index.js',
        '--headless',
        '--isolated',
        '--executable-path',
        executablePath(),
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
  it('calls a tool', async () => {
    await withClient(async client => {
      await client.callTool({
        name: 'select_page',
        arguments: {
          pageIdx: 0,
        },
      });
      const result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      const content = (result.content ?? []) as Array<
        {type: string; text?: string} | undefined
      >;
      assert.equal(content.length, 1);
      const first = content[0];
      const text = first?.type === 'text' ? first.text ?? '' : '';
      assert.ok(
        text.startsWith('# list_pages response\npages:\n['),
        `Unexpected content: ${text}`,
      );
      const serializedPages = text.slice(text.indexOf('pages:\n') + 'pages:\n'.length);
      const pages = JSON.parse(serializedPages);
      assert.equal(pages.length, 1);
      assert.equal(pages[0]?.index, 0);
      assert.equal(pages[0]?.url, 'about:blank');
      assert.equal(pages[0]?.selected, true);
      assert.equal(typeof pages[0]?.id, 'string');
    });
  });

  it('calls a tool multiple times', async () => {
    await withClient(async client => {
      await client.callTool({
        name: 'select_page',
        arguments: {
          pageIdx: 0,
        },
      });
      await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      const result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      const content = (result.content ?? []) as Array<
        {type: string; text?: string} | undefined
      >;
      assert.equal(content.length, 1);
      const first = content[0];
      const text = first?.type === 'text' ? first.text ?? '' : '';
      assert.ok(text.includes('"index": 0'));
    });
  });

  it('has all tools', async () => {
    await withClient(async client => {
      const {tools} = await client.listTools();
      const exposedNames = tools.map(t => t.name).sort();
      const files = fs.readdirSync('build/src/tools');
      const definedNames = [];
      for (const file of files) {
        if (file === 'ToolDefinition.js') {
          continue;
        }
        const fileTools = await import(`../src/tools/${file}`);
        for (const maybeTool of Object.values<object>(fileTools)) {
          if ('name' in maybeTool) {
            definedNames.push(maybeTool.name);
          }
        }
      }
      definedNames.sort();
      assert.deepStrictEqual(exposedNames, definedNames);
    });
  });
});
