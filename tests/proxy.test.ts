/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  isJSONRPCNotification,
  isJSONRPCRequest,
  JSONRPCMessageSchema,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';

const SESSION_ID = 'proxy-test-session';
const PROTOCOL_VERSION = '2025-06-18';
const DELETE_WAIT_TIMEOUT_MS = 5_000;

interface MockEndpoint {
  readonly url: URL;
  readonly messages: JSONRPCMessage[];
  readonly protocolVersions: Array<string | undefined>;
  readonly deletedSessionIds: string[];
  waitForDelete(): Promise<void>;
  waitForInitialize(): Promise<void>;
  releaseInitialize(): void;
  waitForInitializedNotification(): Promise<void>;
  releaseInitializedNotification(): void;
  releaseHeldToolCall(): void;
  close(): Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
  const bodyPromise = Promise.withResolvers<string>();
  let body = '';
  request.setEncoding('utf8');
  request.on('data', chunk => {
    body += chunk;
  });
  request.on('end', () => bodyPromise.resolve(body));
  request.on('error', bodyPromise.reject);
  return bodyPromise.promise;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
  headers: Record<string, string> = {},
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  for (const [name, valueToSet] of Object.entries(headers)) {
    response.setHeader(name, valueToSet);
  }
  response.end(JSON.stringify(value));
}

async function createMockEndpoint(
  options: {
    rejectPosts?: boolean;
    holdFirstToolCall?: boolean;
    holdInitialize?: boolean;
    holdInitializedNotification?: boolean;
  } = {},
): Promise<MockEndpoint> {
  const messages: JSONRPCMessage[] = [];
  const protocolVersions: Array<string | undefined> = [];
  const deletedSessionIds: string[] = [];
  const deleteWaiters: Array<() => void> = [];
  let toolCallCount = 0;
  const firstToolCallRelease = Promise.withResolvers<void>();
  const initializeReceived = Promise.withResolvers<void>();
  const initializeRelease = Promise.withResolvers<void>();
  const initializedNotificationReceived = Promise.withResolvers<void>();
  const initializedNotificationRelease = Promise.withResolvers<void>();

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch(error => {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.url !== '/mcp') {
      writeJson(response, 404, {error: 'not found'});
      return;
    }

    if (request.method === 'DELETE') {
      const sessionId = request.headers['mcp-session-id'];
      if (typeof sessionId === 'string') {
        deletedSessionIds.push(sessionId);
      }
      response.statusCode = 200;
      response.end();
      for (const resolve of deleteWaiters.splice(0)) {
        resolve();
      }
      return;
    }

    if (request.method !== 'POST') {
      response.statusCode = 405;
      response.end();
      return;
    }

    protocolVersions.push(
      typeof request.headers['mcp-protocol-version'] === 'string'
        ? request.headers['mcp-protocol-version']
        : undefined,
    );

    if (options.rejectPosts) {
      writeJson(response, 503, {error: 'unavailable'});
      return;
    }

    const message = JSONRPCMessageSchema.parse(
      JSON.parse(await readBody(request)),
    );
    messages.push(message);
    if (isJSONRPCRequest(message) && message.method === 'initialize') {
      initializeReceived.resolve();
      if (options.holdInitialize) {
        await initializeRelease.promise;
      }
    }

    const sessionId = request.headers['mcp-session-id'];
    if (isJSONRPCRequest(message) && message.method !== 'initialize') {
      if (sessionId !== SESSION_ID) {
        writeJson(response, 400, {error: 'missing session'});
        return;
      }
    }

    if (
      isJSONRPCNotification(message) &&
      message.method === 'notifications/initialized'
    ) {
      initializedNotificationReceived.resolve();
      if (options.holdInitializedNotification) {
        await initializedNotificationRelease.promise;
      }
    }
    if (!isJSONRPCRequest(message)) {
      response.statusCode = 202;
      response.end();
      return;
    }

    if (message.method === 'initialize') {
      writeJson(
        response,
        200,
        {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {tools: {}},
            serverInfo: {name: 'proxy-test-server', version: '1.0.0'},
          },
        },
        {'mcp-session-id': SESSION_ID},
      );
      return;
    }

    if (message.method === 'tools/list') {
      writeJson(response, 200, {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'echo',
              description: 'Returns the supplied value.',
              inputSchema: {
                type: 'object',
                properties: {value: {type: 'string'}},
                required: ['value'],
              },
            },
          ],
        },
      });
      return;
    }

    if (message.method === 'tools/call') {
      toolCallCount++;
      if (options.holdFirstToolCall && toolCallCount === 1) {
        await firstToolCallRelease.promise;
      } else if (options.holdFirstToolCall && toolCallCount === 2) {
        firstToolCallRelease.resolve();
      }

      writeJson(response, 200, {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{type: 'text', text: 'echoed'}],
        },
      });
      return;
    }

    writeJson(response, 200, {
      jsonrpc: '2.0',
      id: message.id,
      error: {code: -32601, message: 'Method not found'},
    });
  }

  const serverReady = Promise.withResolvers<void>();
  server.once('error', serverReady.reject);
  server.listen(0, '127.0.0.1', () => serverReady.resolve());
  await serverReady.promise;

  const address = server.address();
  if (address === null || typeof address === 'string') {
    const serverClosed = Promise.withResolvers<void>();
    server.close(() => serverClosed.resolve());
    await serverClosed.promise;
    throw new Error('Mock endpoint did not receive a TCP address');
  }

  return {
    url: new URL(`http://127.0.0.1:${address.port}/mcp`),
    messages,
    protocolVersions,
    deletedSessionIds,
    waitForDelete(): Promise<void> {
      if (deletedSessionIds.length > 0) {
        return Promise.resolve();
      }
      const deleteWaiter = Promise.withResolvers<void>();
      const deleteTimeout = setTimeout(
        () =>
          deleteWaiter.reject(
            new Error('Timed out waiting for HTTP session DELETE'),
          ),
        DELETE_WAIT_TIMEOUT_MS,
      );
      deleteWaiters.push(() => {
        clearTimeout(deleteTimeout);
        deleteWaiter.resolve();
      });
      return deleteWaiter.promise;
    },
    waitForInitialize(): Promise<void> {
      return initializeReceived.promise;
    },
    releaseInitialize(): void {
      initializeRelease.resolve();
    },
    waitForInitializedNotification(): Promise<void> {
      return initializedNotificationReceived.promise;
    },
    releaseInitializedNotification(): void {
      initializedNotificationRelease.resolve();
    },
    releaseHeldToolCall(): void {
      firstToolCallRelease.resolve();
    },
    close(): Promise<void> {
      firstToolCallRelease.resolve();
      initializeRelease.resolve();
      initializedNotificationRelease.resolve();
      const serverClosed = Promise.withResolvers<void>();
      server.close(error => {
        if (error === undefined) {
          serverClosed.resolve();
        } else {
          serverClosed.reject(error);
        }
      });
      return serverClosed.promise;
    },
  };
}

function createProxyTransport(serverUrl: URL): StdioClientTransport {
  const proxyModule = pathToFileURL(
    fileURLToPath(new URL('../src/proxy.js', import.meta.url)),
  ).href;
  const script = [
    `import {runStdioProxy} from ${JSON.stringify(proxyModule)};`,
    `await runStdioProxy(new URL(${JSON.stringify(serverUrl.href)}));`,
  ].join('\n');
  return new StdioClientTransport({
    command: process.execPath,
    args: ['--input-type=module', '--eval', script],
    cwd: process.cwd(),
    stderr: 'pipe',
  });
}

describe('stdio proxy', () => {
  it('forwards MCP initialization and tool calls, then terminates its HTTP session', async () => {
    const endpoint = await createMockEndpoint();
    const transport = createProxyTransport(endpoint.url);
    const client = new Client(
      {name: 'proxy-test-client', version: '1.0.0'},
      {capabilities: {roots: {listChanged: true}}},
    );

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const result = await client.callTool({
        name: 'echo',
        arguments: {value: 'value'},
      });

      assert.deepEqual(
        tools.tools.map(tool => tool.name),
        ['echo'],
      );
      assert.deepEqual(result.content, [{type: 'text', text: 'echoed'}]);
      assert.equal(endpoint.protocolVersions[0], undefined);
      assert.ok(endpoint.protocolVersions.length > 1);
      for (const protocolVersion of endpoint.protocolVersions.slice(1)) {
        assert.equal(protocolVersion, PROTOCOL_VERSION);
      }
      assert.deepEqual(endpoint.deletedSessionIds, []);
      assert.ok(
        endpoint.messages.some(
          message =>
            isJSONRPCRequest(message) && message.method === 'initialize',
        ),
      );
      assert.ok(
        endpoint.messages.some(
          message =>
            isJSONRPCNotification(message) &&
            message.method === 'notifications/initialized',
        ),
      );
    } finally {
      await client.close();
      await endpoint.waitForDelete();
      assert.deepEqual(endpoint.deletedSessionIds, [SESSION_ID]);
      await endpoint.close();
    }
  });

  it('sends post-initialize requests concurrently when an earlier call is pending', async () => {
    const endpoint = await createMockEndpoint({holdFirstToolCall: true});
    const transport = createProxyTransport(endpoint.url);
    const client = new Client({name: 'proxy-test-client', version: '1.0.0'});

    try {
      await client.connect(transport);
      const calls = await Promise.all([
        client.callTool(
          {name: 'echo', arguments: {value: 'first'}},
          undefined,
          {timeout: 2_000},
        ),
        client.callTool(
          {name: 'echo', arguments: {value: 'second'}},
          undefined,
          {timeout: 2_000},
        ),
      ]);

      assert.deepEqual(
        calls.map(call => call.content),
        [[{type: 'text', text: 'echoed'}], [{type: 'text', text: 'echoed'}]],
      );
      assert.equal(
        endpoint.messages.filter(
          message =>
            isJSONRPCRequest(message) && message.method === 'tools/call',
        ).length,
        2,
      );
    } finally {
      endpoint.releaseHeldToolCall();
      await client.close();
      await endpoint.waitForDelete();
      await endpoint.close();
    }
  });

  it('waits for the initialized notification before forwarding requests', async () => {
    const endpoint = await createMockEndpoint({
      holdInitializedNotification: true,
    });
    const transport = createProxyTransport(endpoint.url);
    const client = new Client({name: 'proxy-test-client', version: '1.0.0'});

    try {
      await client.connect(transport);
      const toolsPromise = client.listTools();
      await endpoint.waitForInitializedNotification();
      assert.equal(
        endpoint.messages.filter(
          message =>
            isJSONRPCRequest(message) && message.method === 'tools/list',
        ).length,
        0,
      );

      endpoint.releaseInitializedNotification();
      const tools = await toolsPromise;
      assert.deepEqual(
        tools.tools.map(tool => tool.name),
        ['echo'],
      );
    } finally {
      endpoint.releaseInitializedNotification();
      await client.close();
      await endpoint.waitForDelete();
      await endpoint.close();
    }
  });

  it('terminates a session when stdio closes during initialization', async () => {
    const endpoint = await createMockEndpoint({holdInitialize: true});
    const transport = createProxyTransport(endpoint.url);

    try {
      await transport.start();
      await transport.send({
        jsonrpc: '2.0',
        id: 'initialize',
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {name: 'proxy-test-client', version: '1.0.0'},
        },
      });
      await endpoint.waitForInitialize();

      const closePromise = transport.close();
      const nextTurn = Promise.withResolvers<void>();
      setImmediate(nextTurn.resolve);
      await nextTurn.promise;
      endpoint.releaseInitialize();
      await closePromise;

      await endpoint.waitForDelete();
      assert.deepEqual(endpoint.deletedSessionIds, [SESSION_ID]);
    } finally {
      endpoint.releaseInitialize();
      await transport.close();
      await endpoint.close();
    }
  });

  it('reports a remote connection failure instead of leaving the stdio client pending', async () => {
    const endpoint = await createMockEndpoint({rejectPosts: true});
    const transport = createProxyTransport(endpoint.url);
    const stderr = transport.stderr;
    if (stderr === null) {
      throw new Error('Expected a piped proxy stderr stream');
    }
    let stderrText = '';
    const stderrClosed = Promise.withResolvers<void>();
    stderr.on('data', chunk => {
      stderrText += chunk.toString();
    });
    stderr.once('end', () => stderrClosed.resolve());
    const client = new Client({name: 'proxy-test-client', version: '1.0.0'});

    try {
      await assert.rejects(client.connect(transport));
      await stderrClosed.promise;
      assert.match(stderrText, /MCP stdio proxy HTTP error/);
    } finally {
      await client.close();
      await endpoint.close();
    }
  });
});
