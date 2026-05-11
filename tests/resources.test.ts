/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {executablePath} from 'puppeteer';
import {z as zod} from 'zod';

describe('Resources', () => {
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
        name: 'resources-test',
        version: '1.0.0',
      },
      {
        capabilities: {
          // @ts-expect-error missing from types
          resources: {subscribe: true},
        },
      },
    );

    try {
      await client.connect(transport);
      await cb(client);
    } finally {
      await client.close();
    }
  }

  it('lists resource templates', async () => {
    await withClient(async client => {
      const {resourceTemplates} = await client.listResourceTemplates();
      assert.ok(
        resourceTemplates.find(t => t.uriTemplate === 'page://{pageId}/source'),
      );
      assert.ok(
        resourceTemplates.find(
          t => t.uriTemplate === 'page://{pageId}/console',
        ),
      );
      assert.ok(
        resourceTemplates.find(
          t => t.uriTemplate === 'page://{pageId}/screenshot',
        ),
      );
      assert.ok(
        resourceTemplates.find(
          t => t.uriTemplate === 'page://{pageId}/devtools-messages',
        ),
      );
    });
  });

  it('lists resources for active pages', async () => {
    await withClient(async client => {
      const {resources} = await client.listResources();
      // Initially there should be one page
      assert.ok(resources.some(r => r.uri.startsWith('page://1/')));
      assert.ok(resources.some(r => r.uri === 'page://1/source'));
    });
  });

  it('reads page source resource', async () => {
    await withClient(async client => {
      const result = await client.readResource({
        uri: 'page://1/source',
      });
      assert.strictEqual(result.contents.length, 1);
      assert.strictEqual(result.contents[0].uri, 'page://1/source');
      assert.strictEqual(result.contents[0].mimeType, 'text/html');
      const content = result.contents[0];
      assert.ok('text' in content);
      assert.ok(typeof content.text === 'string');
      assert.ok(content.text.includes('<html>'));
    });
  });

  it('reads console logs resource', async () => {
    await withClient(async client => {
      // First, trigger a console log
      await client.callTool({
        name: 'evaluate_script',
        arguments: {
          function: '() => console.log("hello from test")',
        },
      });

      const result = await client.readResource({
        uri: 'page://1/console',
      });
      assert.strictEqual(result.contents.length, 1);
      const content = result.contents[0];
      assert.ok('text' in content);
      assert.ok(content.text?.includes('hello from test'));
    });
  });

  it('reads screenshot resource', async () => {
    await withClient(async client => {
      const result = await client.readResource({
        uri: 'page://1/screenshot',
      });
      assert.strictEqual(result.contents.length, 1);
      assert.strictEqual(result.contents[0].mimeType, 'image/png');
      const content = result.contents[0];
      assert.ok('blob' in content);
      assert.ok(content.blob.length > 0);
    });
  });

  it('reads a11y tree resource', async () => {
    await withClient(async client => {
      const result = await client.readResource({
        uri: 'page://1/a11y',
      });
      assert.strictEqual(result.contents.length, 1);
      const content = result.contents[0];
      assert.ok('text' in content);
      assert.ok(content.text?.includes('uid=1_0'));
    });
  });

  it('handles subscriptions and notifications', async () => {
    await withClient(async client => {
      const uri = 'page://1/devtools-messages';
      await client.request(
        {
          method: 'resources/subscribe',
          params: {uri},
        },
        zod.object({}),
      );

      // For now, let's just verify we can subscribe/unsubscribe without error.
      await client.request(
        {
          method: 'resources/unsubscribe',
          params: {uri},
        },
        zod.object({}),
      );
    });
  });
});
