/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import http from 'node:http';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {BrowserManager} from '../../src/BrowserManager.js';
import {ConfigLocator} from '../../src/config/ConfigLocator.js';
import {ConfigParser} from '../../src/config/ConfigParser.js';
import {HttpServer, type HttpMcpServer} from '../../src/http/HttpServer.js';
import {McpServer} from '../../src/index.js';
import {McpContext} from '../../src/McpContext.js';
import {createMockMcpContext, createMockPuppeteerBrowser} from '../mocks.js';

const PROTOCOL_VERSION = '2026-07-28';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withTimeout<T>(
  promise: Promise<T>,
  message: string,
  timeoutMs = 5_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

function createConfigParser(argv: string[] = []): ConfigParser {
  const locator = new ConfigLocator();
  sinon.stub(locator, 'locate').returns(undefined);
  return new ConfigParser(
    '1.0.0',
    ['node', 'script.js', ...argv],
    {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    false,
    locator,
  );
}

async function createTestMcpServer(extraArgs: string[] = []): Promise<{
  server: McpServer;
  browserManager: sinon.SinonStubbedInstance<BrowserManager>;
  context: ReturnType<typeof createMockMcpContext>;
}> {
  const browserManager = sinon.createStubInstance(BrowserManager);
  const browser = createMockPuppeteerBrowser();
  browserManager.ensureBrowser.resolves(browser);

  const context = createMockMcpContext();
  context.ensureBrowser.resolves(browser);
  context.getPages.returns([]);
  sinon.stub(McpContext, 'create').returns(context);

  const config = createConfigParser(extraArgs).parseConfig();
  const server = await McpServer.from(config, {browserManager});
  return {server, browserManager, context};
}

function modernHeaders(
  method: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    'Mcp-Method': method,
    ...extra,
  };
}

function modernPayload(
  id: number | string,
  method: string,
  params: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': {
          name: 'http-server-test',
          version: '1.0.0',
        },
      },
    },
  });
}

async function readJsonBody(
  response: Response,
): Promise<Record<string, unknown>> {
  const parsed: unknown = await response.json();
  assert.ok(isRecord(parsed), 'Expected JSON object response');
  return parsed;
}

function assertSecurityHeaders(headers: Headers): void {
  assert.strictEqual(headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(headers.get('cache-control'), 'no-store');
}

function sendRawHttpRequest(options: {
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return withTimeout(
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: options.port,
          path: options.path,
          method: options.method,
          headers: options.headers,
        },
        res => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            body += chunk;
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body,
            });
          });
        },
      );
      req.on('error', reject);
      if (options.body !== undefined) {
        req.write(options.body);
      }
      req.end();
    }),
    `Timed out waiting for raw HTTP ${options.method} ${options.path}`,
  );
}

class SseEventReader {
  #reader: ReadableStreamDefaultReader<Uint8Array>;
  #decoder = new TextDecoder();
  #buffer = '';

  constructor(body: ReadableStream<Uint8Array>) {
    this.#reader = body.getReader();
  }

  async nextEvent(timeoutMs = 5_000): Promise<Record<string, unknown> | null> {
    while (true) {
      const frameEnd = this.#buffer.indexOf('\n\n');
      if (frameEnd !== -1) {
        const frame = this.#buffer.slice(0, frameEnd);
        this.#buffer = this.#buffer.slice(frameEnd + 2);
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).trimStart());
          }
        }
        if (dataLines.length === 0) {
          continue;
        }
        const parsed: unknown = JSON.parse(dataLines.join('\n'));
        assert.ok(isRecord(parsed), 'Expected JSON object SSE event');
        return parsed;
      }

      const chunk = await withTimeout(
        this.#reader.read(),
        'Timed out waiting for SSE event',
        timeoutMs,
      );
      if (chunk.done) {
        return null;
      }
      this.#buffer += this.#decoder.decode(chunk.value, {stream: true});
    }
  }

  async close(): Promise<void> {
    await this.#reader.cancel().catch(() => {});
  }
}

describe('HttpServer', () => {
  it('serves 2026-07-28 server/discover, tools/list, and tools/call over POST /mcp', async () => {
    const {server: mcpServer, context} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
    });
    const address = await httpServer.start();
    assert.strictEqual(address.host, '127.0.0.1');
    assert.ok(address.port > 0);
    assert.strictEqual(address.path, '/mcp');
    assert.strictEqual(address.url, `http://127.0.0.1:${address.port}/mcp`);

    const discoverRes = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('server/discover'),
      body: modernPayload(1, 'server/discover'),
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(discoverRes.status, 200);
    assertSecurityHeaders(discoverRes.headers);
    const discoverJson = await readJsonBody(discoverRes);
    assert.strictEqual(discoverJson['id'], 1);
    assert.ok(isRecord(discoverJson['result']));

    const listRes = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('tools/list'),
      body: modernPayload(2, 'tools/list'),
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(listRes.status, 200);
    assertSecurityHeaders(listRes.headers);
    const listJson = await readJsonBody(listRes);
    assert.ok(isRecord(listJson['result']));
    const tools = listJson['result']['tools'];
    assert.ok(Array.isArray(tools));
    assert.ok(
      tools.some(tool => isRecord(tool) && tool['name'] === 'list_pages'),
    );

    const callRes = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('tools/call', {'Mcp-Name': 'list_pages'}),
      body: modernPayload(3, 'tools/call', {
        name: 'list_pages',
        arguments: {},
      }),
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(callRes.status, 200);
    assertSecurityHeaders(callRes.headers);
    const callJson = await readJsonBody(callRes);
    assert.strictEqual(callJson['id'], 3);
    assert.ok(isRecord(callJson['result']));
    assert.notStrictEqual(callJson['result']['isError'], true);
    sinon.assert.calledOnce(context.ensureBrowser);
    sinon.assert.calledOnce(context.createPagesSnapshot);
  });

  it('rejects legacy 2025 initialize requests', async () => {
    const {server: mcpServer} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
    });
    const address = await httpServer.start();

    const response = await fetch(address.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {name: 'legacy-client', version: '1.0.0'},
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });

    assert.strictEqual(response.status, 400);
    assertSecurityHeaders(response.headers);
    const body = await readJsonBody(response);
    assert.ok(isRecord(body['error']));
    assert.match(String(body['error']['message']), /protocol version/i);
  });

  it('returns 404 for unknown paths and 405 for unsupported methods', async () => {
    const {server: mcpServer} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
    });
    const address = await httpServer.start();

    const notFound = await fetch(`http://127.0.0.1:${address.port}/other`, {
      method: 'POST',
      headers: modernHeaders('server/discover'),
      body: modernPayload(1, 'server/discover'),
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(notFound.status, 404);
    assertSecurityHeaders(notFound.headers);

    const methodNotAllowed = await fetch(address.url, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(methodNotAllowed.status, 405);
    assert.strictEqual(methodNotAllowed.headers.get('allow'), 'POST, GET');
    assertSecurityHeaders(methodNotAllowed.headers);
  });

  it('enforces Bearer token authentication with WWW-Authenticate: Bearer', async () => {
    const {server: mcpServer} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
      httpToken: 'secret-http-token',
    });
    const address = await httpServer.start();

    const missingAuth = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('server/discover'),
      body: modernPayload(1, 'server/discover'),
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(missingAuth.status, 401);
    assert.strictEqual(missingAuth.headers.get('www-authenticate'), 'Bearer');
    assertSecurityHeaders(missingAuth.headers);
    const missingBody = await missingAuth.text();
    assert.strictEqual(missingBody.includes('resource_metadata'), false);

    const wrongAuth = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('server/discover', {
        Authorization: 'Bearer invalid-token',
      }),
      body: modernPayload(2, 'server/discover'),
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(wrongAuth.status, 401);
    assert.strictEqual(wrongAuth.headers.get('www-authenticate'), 'Bearer');

    const validAuth = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('server/discover', {
        Authorization: 'Bearer secret-http-token',
      }),
      body: modernPayload(3, 'server/discover'),
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(validAuth.status, 200);
    assertSecurityHeaders(validAuth.headers);
  });

  it('rejects disallowed Host and Origin headers with 403', async () => {
    const {server: mcpServer} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
    });
    const address = await httpServer.start();

    const badHost = await sendRawHttpRequest({
      port: address.port,
      path: '/mcp',
      method: 'POST',
      headers: {
        ...modernHeaders('server/discover'),
        Host: 'evil.example:3000',
      },
      body: modernPayload(1, 'server/discover'),
    });
    assert.strictEqual(badHost.status, 403);
    assert.strictEqual(badHost.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(badHost.headers['x-frame-options'], 'DENY');
    assert.strictEqual(badHost.headers['cache-control'], 'no-store');

    const badOrigin = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('server/discover', {
        Origin: 'https://evil.example',
      }),
      body: modernPayload(2, 'server/discover'),
      signal: AbortSignal.timeout(5_000),
    });
    assert.strictEqual(badOrigin.status, 403);
    assertSecurityHeaders(badOrigin.headers);
  });

  it('refuses non-loopback host in start() without binding or creating a handler', async () => {
    const createHttpHandler = sinon.stub();
    const stubServer: HttpMcpServer = {createHttpHandler};
    await using httpServer = new HttpServer(stubServer, {
      host: '0.0.0.0',
      port: 0,
    });

    await assert.rejects(
      () => httpServer.start(),
      /Refusing to bind non-loopback host "0\.0\.0\.0" without authentication/,
    );
    sinon.assert.notCalled(createHttpHandler);
  });

  it('rejects double start() cleanly and supports idempotent close()', async () => {
    const {server: mcpServer} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
    });

    await httpServer.start();
    await assert.rejects(
      () => httpServer.start(),
      /HttpServer is already started/,
    );

    await httpServer.close();
    await httpServer.close();
  });

  it('delivers notifications/tools/list_changed over subscriptions/listen on applyConfig()', async () => {
    const {server: mcpServer} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
    });
    const address = await httpServer.start();

    const controller = new AbortController();
    const listenRes = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('subscriptions/listen'),
      body: modernPayload(10, 'subscriptions/listen', {
        notifications: {toolsListChanged: true},
      }),
      signal: controller.signal,
    });
    assert.strictEqual(listenRes.status, 200);
    assert.match(
      listenRes.headers.get('content-type') ?? '',
      /text\/event-stream/i,
    );
    assertSecurityHeaders(listenRes.headers);
    assert.ok(listenRes.body, 'Expected streaming SSE body');

    const reader = new SseEventReader(listenRes.body);
    try {
      const ack = await reader.nextEvent();
      assert.ok(ack);
      assert.strictEqual(
        ack['method'],
        'notifications/subscriptions/acknowledged',
      );

      await server.applyConfig(
        createConfigParser(['--memoryDebugging']).parseConfig(),
      );

      const notification = await reader.nextEvent();
      assert.ok(notification);
      assert.strictEqual(
        notification['method'],
        'notifications/tools/list_changed',
      );
    } finally {
      controller.abort();
      await reader.close();
    }
  });

  it('handles concurrent tools/call requests safely', async () => {
    const {server: mcpServer, context} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
    });
    const address = await httpServer.start();

    const requestIds = [101, 102, 103];
    const responses = await Promise.all(
      requestIds.map(async id => {
        const res = await fetch(address.url, {
          method: 'POST',
          headers: modernHeaders('tools/call', {'Mcp-Name': 'list_pages'}),
          body: modernPayload(id, 'tools/call', {
            name: 'list_pages',
            arguments: {},
          }),
          signal: AbortSignal.timeout(5_000),
        });
        assert.strictEqual(res.status, 200);
        return await readJsonBody(res);
      }),
    );

    assert.deepStrictEqual(
      responses.map(body => body['id']),
      requestIds,
    );
    for (const body of responses) {
      assert.ok(isRecord(body['result']));
      assert.notStrictEqual(body['result']['isError'], true);
    }
    sinon.assert.callCount(context.createPagesSnapshot, requestIds.length);
  });

  it('closes cleanly even with an open subscriptions/listen SSE stream', async () => {
    const {server: mcpServer} = await createTestMcpServer();
    await using server = mcpServer;
    await using httpServer = new HttpServer(server, {
      host: '127.0.0.1',
      port: 0,
    });
    const address = await httpServer.start();

    const listenRes = await fetch(address.url, {
      method: 'POST',
      headers: modernHeaders('subscriptions/listen'),
      body: modernPayload(20, 'subscriptions/listen', {
        notifications: {toolsListChanged: true},
      }),
      signal: AbortSignal.timeout(10_000),
    });
    assert.strictEqual(listenRes.status, 200);
    assert.ok(listenRes.body, 'Expected streaming SSE body');

    const reader = new SseEventReader(listenRes.body);
    try {
      const ack = await reader.nextEvent();
      assert.ok(ack);
      assert.strictEqual(
        ack['method'],
        'notifications/subscriptions/acknowledged',
      );

      await withTimeout(
        httpServer.close(),
        'HttpServer.close() hung with an open SSE stream',
        5_000,
      );

      const finalEvent = await reader.nextEvent();
      if (finalEvent !== null) {
        assert.strictEqual(finalEvent['id'], 20);
        assert.strictEqual(await reader.nextEvent(), null);
      }
    } finally {
      await reader.close();
    }
  });
});
