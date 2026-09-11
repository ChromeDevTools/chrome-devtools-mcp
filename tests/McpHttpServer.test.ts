/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import {executablePath} from 'puppeteer';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import {parseArguments} from '../src/config/mcp-options.js';
import {McpHttpServer} from '../src/McpHttpServer.js';

async function testArgs() {
  return parseArguments(
    '0.0.0',
    [
      'node',
      'test',
      '--headless',
      '--isolated',
      '--executable-path',
      await executablePath(),
      '--no-usage-statistics',
    ],
    {},
  );
}

async function connectClient(url: string) {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({name: 'http-test-client', version: '1.0.0'});
  await client.connect(transport);
  return {client, transport};
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Condition not met within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('McpHttpServer', () => {
  let server: McpHttpServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('serves multiple isolated MCP sessions', async () => {
    server = await McpHttpServer.start(await testArgs(), {port: 0});
    const [first, second] = await Promise.all([
      connectClient(server.url),
      connectClient(server.url),
    ]);

    assert.ok(first.transport.sessionId);
    assert.ok(second.transport.sessionId);
    assert.notStrictEqual(
      first.transport.sessionId,
      second.transport.sessionId,
    );
    assert.strictEqual(server.sessionCount, 2);

    const firstTools = await first.client.listTools();
    const secondTools = await second.client.listTools();
    assert.ok(firstTools.tools.length > 0);
    assert.deepStrictEqual(
      firstTools.tools.map(tool => tool.name),
      secondTools.tools.map(tool => tool.name),
    );

    await first.client.close();
    await second.client.close();
  });

  it('keeps browser state isolated between sessions', async () => {
    server = await McpHttpServer.start(await testArgs(), {port: 0});
    const first = await connectClient(server.url);
    const second = await connectClient(server.url);

    try {
      await first.client.callTool({
        name: 'new_page',
        arguments: {
          url: 'data:text/html,<title>first-http-session</title>',
        },
      });
      const secondPages = await second.client.callTool({
        name: 'list_pages',
        arguments: {},
      });

      assert.doesNotMatch(JSON.stringify(secondPages), /first-http-session/);
    } finally {
      await first.client.close();
      await second.client.close();
    }
  });

  it('cleans up a session on DELETE without affecting another session', async () => {
    server = await McpHttpServer.start(await testArgs(), {port: 0});
    const first = await connectClient(server.url);
    const second = await connectClient(server.url);
    const activeServer = server;

    await first.transport.terminateSession();
    await waitFor(() => activeServer.sessionCount === 1);
    const tools = await second.client.listTools();
    assert.ok(tools.tools.length > 0);

    await first.client.close();
    await second.client.close();
  });

  it('rejects requests without a valid session', async () => {
    server = await McpHttpServer.start(await testArgs(), {port: 0});
    const response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({jsonrpc: '2.0', method: 'tools/list', id: 1}),
    });
    await response.text();

    assert.strictEqual(response.status, 400);
    assert.strictEqual(server.sessionCount, 0);
  });

  it('cleans up an initialization rejected by the transport', async () => {
    server = await McpHttpServer.start(await testArgs(), {port: 0});
    const response = await fetch(server.url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {name: 'http-test-client', version: '1.0.0'},
        },
      }),
    });
    await response.text();

    assert.strictEqual(response.status, 406);
    assert.strictEqual(server.sessionCount, 0);
  });

  it('rejects unknown sessions and paths', async () => {
    server = await McpHttpServer.start(await testArgs(), {port: 0});
    const unknownSessionResponse = await fetch(server.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': 'unknown-session',
      },
      body: JSON.stringify({jsonrpc: '2.0', method: 'tools/list', id: 1}),
    });
    await unknownSessionResponse.text();
    assert.strictEqual(unknownSessionResponse.status, 404);

    const pathResponse = await fetch(`http://127.0.0.1:${server.port}/other`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
    });
    await pathResponse.text();
    assert.strictEqual(pathResponse.status, 404);
  });

  it('closes all sessions and the listener', async () => {
    server = await McpHttpServer.start(await testArgs(), {port: 0});
    const client = await connectClient(server.url);
    assert.strictEqual(server.sessionCount, 1);

    await server.close();
    server = undefined;
    await assert.rejects(() => client.client.listTools());
    await client.client.close();
  });
});
