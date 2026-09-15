/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {type ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {createServer as createNetServer} from 'node:net';
import {after, before, describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {executablePath} from 'puppeteer';
import sinon from 'sinon';

import {closeBrowser} from '../src/browser.js';
import {parseArguments} from '../src/config/mcp-options.js';
import {HttpMcpServer} from '../src/http-server.js';
import {McpServer} from '../src/index.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';

interface TestClient {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

type ToolCallResult = Awaited<ReturnType<Client['callTool']>>;

function isTextContent(
  content: unknown,
): content is {type: 'text'; text: string} {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    content.type === 'text' &&
    'text' in content &&
    typeof content.text === 'string'
  );
}

function responseText(result: ToolCallResult): string {
  if (!('content' in result) || !Array.isArray(result.content)) {
    throw new Error('Expected an immediate tool result');
  }
  return result.content
    .filter(isTextContent)
    .map(content => content.text)
    .join('\n');
}

function pageIdFor(result: ToolCallResult, url: string): number {
  for (const line of responseText(result).split('\n')) {
    const match = line.match(/^(\d+): /);
    if (match?.[1] && line.includes(url)) {
      return Number(match[1]);
    }
  }
  throw new Error(`Page ${url} was not listed`);
}

function selectedLine(result: ToolCallResult): string {
  const line = responseText(result)
    .split('\n')
    .find(candidate => candidate.endsWith(' [selected]'));
  if (!line) {
    throw new Error('No selected page was listed');
  }
  return line;
}

async function connectClient(url: URL, name: string): Promise<TestClient> {
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({name, version: '1.0.0'}, {capabilities: {}});
  await client.connect(transport);
  return {client, transport};
}

async function testArguments() {
  return parseArguments(
    '0.0.0',
    [
      'node',
      'main.js',
      '--headless',
      '--isolated',
      '--executable-path',
      await executablePath(),
      '--no-usage-statistics',
    ],
    {},
  );
}

async function waitForSessionCount(
  server: HttpMcpServer,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.sessionCount === expected) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(
    `Expected ${expected} HTTP sessions, found ${server.sessionCount}`,
  );
}

async function freePort(): Promise<number> {
  const listener = createNetServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to allocate a test port');
  }
  await new Promise<void>((resolve, reject) => {
    listener.close(error => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function waitForHealth(
  url: URL,
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const healthUrl = new URL('/healthz', url);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('HTTP MCP entrypoint exited before becoming healthy');
    }
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The listener may not have bound yet.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('HTTP MCP entrypoint did not become healthy');
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error('HTTP MCP entrypoint did not exit within 10 seconds'));
    }, 10000);
    const onExit = () => {
      clearTimeout(timeout);
      resolve();
    };
    child.once('exit', onExit);
  });
}

async function rawPost(
  url: URL,
  headers: Record<string, string>,
  body: string,
): Promise<number> {
  return await new Promise((resolve, reject) => {
    const request = httpRequest(url, {method: 'POST', headers}, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    request.once('error', reject);
    request.end(body);
  });
}

describe('Streamable HTTP server', () => {
  let server: HttpMcpServer;
  const clients: TestClient[] = [];

  before(async () => {
    const args = await testArguments();
    server = new HttpMcpServer(args, {
      host: '127.0.0.1',
      port: 0,
      sessionIdleTimeoutMs: 0,
    });
    await server.start();
  });

  after(async () => {
    for (const {client, transport} of clients) {
      try {
        await transport.terminateSession();
      } catch {
        // The test may already have terminated this session.
      }
      await client.close();
    }
    await server.close();
    await closeBrowser();
  });

  it('rejects untrusted Host and Origin headers', async () => {
    const initialize = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {name: 'security-test', version: '1.0.0'},
      },
    });
    const badHostStatus = await rawPost(
      server.url,
      {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        host: 'evil.example',
      },
      initialize,
    );
    assert.strictEqual(badHostStatus, 403);

    const badOriginStatus = await rawPost(
      server.url,
      {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      initialize,
    );
    assert.strictEqual(badOriginStatus, 403);
    assert.strictEqual(server.sessionCount, 0);
  });

  it('isolates client page selection while sharing one browser launch', async () => {
    const clientA = await connectClient(server.url, 'http-client-a');
    const clientB = await connectClient(server.url, 'http-client-b');
    clients.push(clientA, clientB);

    assert.ok(clientA.transport.sessionId);
    assert.ok(clientB.transport.sessionId);
    assert.notStrictEqual(
      clientA.transport.sessionId,
      clientB.transport.sessionId,
    );
    assert.strictEqual(server.sessionCount, 2);

    await Promise.all([
      clientA.client.callTool({name: 'list_pages', arguments: {}}),
      clientB.client.callTool({name: 'list_pages', arguments: {}}),
    ]);

    const urlA = 'data:text/html,<title>http-session-a</title>';
    const urlB = 'data:text/html,<title>http-session-b</title>';
    await clientA.client.callTool({
      name: 'new_page',
      arguments: {url: urlA, background: true},
    });
    await clientB.client.callTool({
      name: 'new_page',
      arguments: {url: urlB, background: true},
    });

    const pagesA = await clientA.client.callTool({
      name: 'list_pages',
      arguments: {},
    });
    const pagesB = await clientB.client.callTool({
      name: 'list_pages',
      arguments: {},
    });
    assert.match(responseText(pagesA), /http-session-b/);
    assert.match(responseText(pagesB), /http-session-a/);
    const pageA = pageIdFor(pagesA, urlA);
    const pageB = pageIdFor(pagesB, urlB);

    await clientA.client.callTool({
      name: 'select_page',
      arguments: {pageId: pageA, bringToFront: false},
    });
    await clientB.client.callTool({
      name: 'select_page',
      arguments: {pageId: pageB, bringToFront: false},
    });

    const [selectedA, selectedB] = await Promise.all([
      clientA.client.callTool({name: 'list_pages', arguments: {}}),
      clientB.client.callTool({name: 'list_pages', arguments: {}}),
    ]);
    assert.match(selectedLine(selectedA), /http-session-a/);
    assert.match(selectedLine(selectedB), /http-session-b/);
  });

  it('reports health and removes explicitly terminated sessions', async () => {
    const healthUrl = new URL('/healthz', server.url);
    const health = await fetch(healthUrl);
    assert.strictEqual(health.status, 200);
    assert.deepStrictEqual(await health.json(), {status: 'ok', sessions: 2});

    const malformedStatus = await rawPost(
      server.url,
      {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': clients[0].transport.sessionId ?? '',
      },
      '{',
    );
    assert.strictEqual(malformedStatus, 400);
    assert.strictEqual(server.sessionCount, 2);

    await clients[0].transport.terminateSession();
    assert.strictEqual(server.sessionCount, 1);

    const unknownSession = await fetch(server.url, {
      method: 'DELETE',
      headers: {'mcp-session-id': 'not-a-session'},
    });
    assert.strictEqual(unknownSession.status, 404);
  });

  it('closes sessions after their idle timeout', async () => {
    const idleServer = new HttpMcpServer(await testArguments(), {
      host: '127.0.0.1',
      port: 0,
      sessionIdleTimeoutMs: 50,
    });
    await idleServer.start();
    const idleClient = await connectClient(idleServer.url, 'idle-http-client');
    try {
      assert.strictEqual(idleServer.sessionCount, 1);
      await waitForSessionCount(idleServer, 0);
    } finally {
      await idleClient.client.close();
      await idleServer.close();
    }
  });

  it('initializes process telemetry only once for multiple session servers', async () => {
    const telemetry = sinon.createStubInstance(ClearcutLogger);
    const getTelemetry = sinon.stub(ClearcutLogger, 'get');
    getTelemetry.onFirstCall().returns(undefined);
    getTelemetry.returns(telemetry);
    const initializeTelemetry = sinon
      .stub(ClearcutLogger, 'initialize')
      .returns(telemetry);
    const args = await testArguments();
    args.usageStatistics = true;
    const servers: McpServer[] = [];
    try {
      servers.push(await McpServer.from(args), await McpServer.from(args));
      sinon.assert.calledOnce(initializeTelemetry);
    } finally {
      await Promise.all(servers.map(server => server.close()));
      initializeTelemetry.restore();
      getTelemetry.restore();
    }
  });

  it('serves HTTP from the executable and outlives stdin EOF', async () => {
    const port = await freePort();
    const child = spawn(
      process.execPath,
      [
        'build/src/bin/chrome-devtools-mcp.js',
        '--port',
        String(port),
        '--no-usage-statistics',
      ],
      {stdio: ['pipe', 'pipe', 'pipe']},
    );
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    let client: TestClient | undefined;
    try {
      const url = new URL(`http://127.0.0.1:${port}/mcp`);
      await waitForHealth(url, child);
      child.stdin.end();
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.strictEqual(
        child.exitCode,
        null,
        `HTTP MCP entrypoint exited on stdin EOF: ${stderr}`,
      );

      client = await connectClient(url, 'entrypoint-http-client');
      const tools = await client.client.listTools();
      assert.ok(tools.tools.length > 0);

      child.kill('SIGTERM');
      await waitForExit(child);
      assert.strictEqual(child.exitCode, 0, stderr);
    } finally {
      if (client) {
        try {
          await client.client.close();
        } catch {
          // The child may have closed the client transport first.
        }
      }
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await waitForExit(child);
      }
    }
  });
});
