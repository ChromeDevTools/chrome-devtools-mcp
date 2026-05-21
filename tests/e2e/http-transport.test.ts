/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {type ChildProcess, spawn} from 'node:child_process';
import * as net from 'node:net';
import {after, before, describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {executablePath} from 'puppeteer';

/** Find a free TCP port by binding to :0 and reading the assigned port. */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr !== null && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          reject(new Error('Could not determine free port'));
        }
      });
    });
  });
}

interface HealthResponse {
  status: string;
  chrome_connected: boolean;
  sessions: number;
}

function assertHealthResponse(value: unknown): asserts value is HealthResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('status' in value) ||
    !('sessions' in value) ||
    !('chrome_connected' in value)
  ) {
    throw new Error(`Invalid health response: ${JSON.stringify(value)}`);
  }
}

interface JsonRpcErrorResponse {
  error: {code: number; message: string};
}

function assertJsonRpcError(
  value: unknown,
): asserts value is JsonRpcErrorResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('error' in value) ||
    typeof value.error !== 'object' ||
    value.error === null ||
    !('code' in value.error)
  ) {
    throw new Error(
      `Invalid JSON-RPC error response: ${JSON.stringify(value)}`,
    );
  }
}

interface TestServer {
  mcpUrl: string;
  healthUrl: string;
  stop(): Promise<void>;
}

/** Spawn the MCP server in HTTP mode and wait until it is healthy. */
async function spawnServer(
  extraEnv: Record<string, string> = {},
): Promise<TestServer> {
  const port = await getFreePort();
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const healthUrl = `http://127.0.0.1:${port}/health`;

  const proc: ChildProcess = spawn(
    'node',
    [
      'build/src/bin/chrome-devtools-mcp.js',
      '--headless',
      '--isolated',
      '--executable-path',
      executablePath(),
      '--port',
      String(port),
    ],
    {
      env: {
        ...process.env,
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: 'true',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stderr = '';
  proc.stderr?.on('data', chunk => {
    stderr += String(chunk);
  });
  proc.on('error', err => {
    console.error('Server process error:', err);
  });

  async function stop(): Promise<void> {
    proc.kill('SIGTERM');
    await new Promise<void>(resolve => {
      proc.on('exit', () => resolve());
      setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 5000);
    });
  }

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        return {mcpUrl, healthUrl, stop};
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.error('Server stderr:', stderr);
  await stop();
  throw new Error('Server did not start within 15000ms');
}

function createClient(): Client {
  return new Client(
    {name: 'http-transport-test', version: '1.0.0'},
    {capabilities: {}},
  );
}

function createTransport(mcpUrl: string): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL(mcpUrl));
}

async function getHealth(healthUrl: string): Promise<HealthResponse> {
  const res = await fetch(healthUrl);
  const data: unknown = await res.json();
  assertHealthResponse(data);
  return data;
}

/**
 * Close a client cleanly. The SDK's client close() does not send an MCP
 * DELETE, so terminateSession() is called first to release the server-side
 * session immediately instead of leaving it for the idle reaper.
 */
async function closeClient(
  client: Client,
  transport: StreamableHTTPClientTransport,
): Promise<void> {
  await transport.terminateSession().catch(() => undefined);
  await client.close().catch(() => undefined);
}

describe('HTTP transport session management', () => {
  let server: TestServer;

  before(async () => {
    server = await spawnServer();
  });

  after(async () => {
    await server?.stop();
  });

  it('single client can initialize and call tools', async () => {
    const client = createClient();
    const transport = createTransport(server.mcpUrl);
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.ok(tools.tools.length > 0, 'Should have tools available');
    } finally {
      await closeClient(client, transport);
    }
  });

  it('second client can connect after first disconnects cleanly', async () => {
    const client1 = createClient();
    const transport1 = createTransport(server.mcpUrl);
    await client1.connect(transport1);
    const tools1 = await client1.listTools();
    assert.ok(tools1.tools.length > 0);
    await closeClient(client1, transport1);

    const client2 = createClient();
    const transport2 = createTransport(server.mcpUrl);
    await client2.connect(transport2);
    const tools2 = await client2.listTools();
    assert.ok(tools2.tools.length > 0);
    await closeClient(client2, transport2);
  });

  it('second client can connect after first drops the HTTP connection without MCP session teardown', async () => {
    // Simulate an abrupt client loss: close the transport-level HTTP connection
    // without going through an MCP DELETE. The server keeps that session until
    // the idle reaper collects it — meanwhile a new client must still connect.
    const client1 = createClient();
    const transport1 = createTransport(server.mcpUrl);
    await client1.connect(transport1);
    const tools1 = await client1.listTools();
    assert.ok(tools1.tools.length > 0);

    // Drop the transport without sending MCP session DELETE.
    transport1.close().catch(() => undefined);
    await new Promise(r => setTimeout(r, 500));

    // A new client must still be able to initialize and use the server.
    const client2 = createClient();
    const transport2 = createTransport(server.mcpUrl);
    await client2.connect(transport2);
    const tools2 = await client2.listTools();
    assert.ok(tools2.tools.length > 0);
    await closeClient(client2, transport2);
  });

  it('handles rapid sequential reconnections', async () => {
    for (let i = 0; i < 5; i++) {
      const client = createClient();
      const transport = createTransport(server.mcpUrl);
      await client.connect(transport);
      const tools = await client.listTools();
      assert.ok(
        tools.tools.length > 0,
        `Connection ${i + 1} should have tools`,
      );
      await closeClient(client, transport);
    }
  });

  it('serves multiple concurrent sessions without evicting any', async () => {
    // Launch several clients simultaneously. They share one browser but each
    // gets its own session — every one must connect AND remain usable after
    // the others have connected. Under the old single-session model each new
    // initialize evicted its predecessors and this would fail.
    const NUM_CONCURRENT = 3;
    const before = (await getHealth(server.healthUrl)).sessions;
    const connections = await Promise.all(
      Array.from({length: NUM_CONCURRENT}, async (_, i) => {
        const client = createClient();
        const transport = createTransport(server.mcpUrl);
        await client.connect(transport);
        const tools = await client.listTools();
        assert.ok(tools.tools.length > 0, `Client ${i} should get tools`);
        return {client, transport};
      }),
    );

    // All sessions are registered at the same time — none evicted the others.
    const health = await getHealth(server.healthUrl);
    assert.ok(
      health.sessions >= before + NUM_CONCURRENT,
      `Expected at least ${before + NUM_CONCURRENT} sessions, got ${health.sessions}`,
    );
    assert.strictEqual(health.status, 'ok', 'Server should still be healthy');

    // Every client is still independently usable after all peers connected.
    for (const [i, {client}] of connections.entries()) {
      const tools = await client.listTools();
      assert.ok(
        tools.tools.length > 0,
        `Client ${i} must still work after peer clients connected`,
      );
    }

    for (const {client, transport} of connections) {
      await closeClient(client, transport);
    }
  });

  it('an earlier session survives a later session connecting', async () => {
    // Deterministic no-eviction check: connect A, then B, then prove A still
    // works. Connecting B must not tear down A's session.
    const clientA = createClient();
    const transportA = createTransport(server.mcpUrl);
    await clientA.connect(transportA);
    assert.ok((await clientA.listTools()).tools.length > 0);

    const clientB = createClient();
    const transportB = createTransport(server.mcpUrl);
    await clientB.connect(transportB);
    assert.ok((await clientB.listTools()).tools.length > 0);

    const toolsA = await clientA.listTools();
    assert.ok(
      toolsA.tools.length > 0,
      'Client A must still work — connecting client B must not evict it',
    );

    await closeClient(clientA, transportA);
    await closeClient(clientB, transportB);
  });

  it('multiple sessions can call tools concurrently without interference', async () => {
    // The multi-agent core scenario: N independent sessions firing tool calls
    // in parallel. They share one browser and one tool mutex, so calls are
    // serialized server-side — every call must still complete successfully and
    // the burst must not deadlock or leave the server unhealthy. Under a
    // per-session mutex (a tempting "optimization") concurrent tools would
    // race the shared browser state and this would flake.
    const NUM_CLIENTS = 3;
    const CALLS_PER_CLIENT = 4;
    const conns = await Promise.all(
      Array.from({length: NUM_CLIENTS}, async () => {
        const c = createClient();
        const t = createTransport(server.mcpUrl);
        await c.connect(t);
        return {c, t};
      }),
    );

    const results = await Promise.all(
      conns.flatMap(({c}, i) =>
        Array.from({length: CALLS_PER_CLIENT}, async (_, k) => {
          const r = await c.callTool({name: 'list_pages', arguments: {}});
          return {clientIndex: i, callIndex: k, result: r};
        }),
      ),
    );

    assert.strictEqual(
      results.length,
      NUM_CLIENTS * CALLS_PER_CLIENT,
      'every concurrent tool call should complete',
    );
    for (const {clientIndex, callIndex, result} of results) {
      assert.ok(
        Array.isArray(result.content) && result.content.length > 0,
        `client ${clientIndex} call ${callIndex} should return content`,
      );
    }

    const health = await getHealth(server.healthUrl);
    assert.strictEqual(
      health.status,
      'ok',
      'server must stay healthy under concurrent multi-session load',
    );

    for (const {c, t} of conns) {
      await closeClient(c, t);
    }
  });

  it('health endpoint reflects sessions appearing and being reclaimed', async () => {
    const before = (await getHealth(server.healthUrl)).sessions;

    const client = createClient();
    const transport = createTransport(server.mcpUrl);
    await client.connect(transport);

    const during = await getHealth(server.healthUrl);
    assert.strictEqual(
      during.sessions,
      before + 1,
      'connecting a client must add exactly one session',
    );
    assert.strictEqual(during.status, 'ok');

    await closeClient(client, transport);
    await new Promise(r => setTimeout(r, 300));

    const restored = (await getHealth(server.healthUrl)).sessions;
    assert.strictEqual(
      restored,
      before,
      'a clean MCP DELETE must remove the session',
    );
  });

  it('client can call tools after reconnecting to a recovered server', async () => {
    const client1 = createClient();
    const transport1 = createTransport(server.mcpUrl);
    await client1.connect(transport1);
    const result1 = await client1.callTool({name: 'list_pages', arguments: {}});
    assert.ok(
      Array.isArray(result1.content) && result1.content.length > 0,
      'First tool call should return content',
    );

    // Drop without MCP teardown.
    transport1.close().catch(() => undefined);
    await new Promise(r => setTimeout(r, 500));

    const client2 = createClient();
    const transport2 = createTransport(server.mcpUrl);
    await client2.connect(transport2);
    const result2 = await client2.callTool({name: 'list_pages', arguments: {}});
    assert.ok(
      Array.isArray(result2.content) && result2.content.length > 0,
      'Second tool call should return content after reconnect',
    );
    await closeClient(client2, transport2);
  });

  it('rejects an unknown session ID with 404 and a JSON-RPC error', async () => {
    // A request carrying a session ID this process never issued — the typical
    // shape after a server restart wiped the in-memory session map.
    const res = await fetch(server.mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': 'does-not-exist',
      },
      body: JSON.stringify({jsonrpc: '2.0', method: 'tools/list', id: 1}),
    });
    assert.strictEqual(res.status, 404, 'Stale session must return 404');
    const data: unknown = await res.json();
    assertJsonRpcError(data);
    assert.strictEqual(data.error.code, -32001);
  });

  it('rejects a non-initialize request with no session ID as 400', async () => {
    const res = await fetch(server.mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({jsonrpc: '2.0', method: 'tools/list', id: 1}),
    });
    assert.strictEqual(res.status, 400);
    const data: unknown = await res.json();
    assertJsonRpcError(data);
    assert.strictEqual(data.error.code, -32000);
  });

  it('rejects a malformed body with 400 instead of hanging', async () => {
    // Before the fix, an unparseable body threw out of the async request
    // handler and the connection hung with no response. Bound the wait so a
    // regression fails fast instead of stalling the suite.
    const res = await fetch(server.mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: '{not valid json',
      signal: AbortSignal.timeout(5000),
    });
    assert.strictEqual(res.status, 400);
    const data: unknown = await res.json();
    assertJsonRpcError(data);
    assert.strictEqual(data.error.code, -32700);
  });

  it('clean DELETE shutdown reclaims sessions without leaking', async () => {
    const before = (await getHealth(server.healthUrl)).sessions;
    const CYCLES = 20;
    for (let i = 0; i < CYCLES; i++) {
      const client = createClient();
      const transport = createTransport(server.mcpUrl);
      await client.connect(transport);
      await client.listTools();
      await closeClient(client, transport);
    }
    await new Promise(r => setTimeout(r, 300));

    const health = await getHealth(server.healthUrl);
    assert.strictEqual(health.status, 'ok');
    assert.strictEqual(
      health.sessions,
      before,
      `Session count should return to ${before} after clean cycles, got ${health.sessions}`,
    );
  });
});

describe('HTTP transport idle session reaping', () => {
  let server: TestServer;

  before(async () => {
    // A short idle TTL so the reaper can be observed within the test.
    server = await spawnServer({
      CHROME_DEVTOOLS_MCP_SESSION_IDLE_TTL_MS: '2000',
    });
  });

  after(async () => {
    await server?.stop();
  });

  it('reaps a session whose client went away without DELETE', async () => {
    // The real abandoned-client case: client crashed / lost network. The SDK
    // never sends DELETE; the server only knows because the GET SSE stream
    // socket eventually closes, dropping activeRequests to 0. Then the idle
    // TTL has to reclaim what's left. Simulate it by aborting the transport
    // (no DELETE) before waiting.
    const before = (await getHealth(server.healthUrl)).sessions;

    const client = createClient();
    const transport = createTransport(server.mcpUrl);
    await client.connect(transport);
    assert.strictEqual(
      (await getHealth(server.healthUrl)).sessions,
      before + 1,
      'session should be registered after connect',
    );

    // Abrupt transport-level close — no MCP DELETE, just drop the socket.
    await transport.close().catch(() => undefined);

    // Stay past the 2s TTL and at least one reaper sweep.
    await new Promise(r => setTimeout(r, 7000));

    assert.strictEqual(
      (await getHealth(server.healthUrl)).sessions,
      before,
      'an abandoned session must be reaped once it passes the TTL',
    );
  });

  it('does not reap a connected client even when lastActivity is older than the TTL', async () => {
    // A client that is connected and just idle is NOT a dead client — its GET
    // SSE stream is still open, so activeRequests > 0 and the reaper must
    // leave it alone. Otherwise legitimate idle clients would silently lose
    // their notification channel as soon as they stop sending POSTs.
    const before = (await getHealth(server.healthUrl)).sessions;

    const client = createClient();
    const transport = createTransport(server.mcpUrl);
    await client.connect(transport);
    assert.strictEqual(
      (await getHealth(server.healthUrl)).sessions,
      before + 1,
    );

    // Sit on the connection past the TTL with no POSTs. The GET stream alone
    // keeps activeRequests at 1, so the reaper must skip this session.
    await new Promise(r => setTimeout(r, 5000));

    assert.strictEqual(
      (await getHealth(server.healthUrl)).sessions,
      before + 1,
      'connected idle client must survive the reaper',
    );
    // Confirm the session is still functional after surviving the TTL.
    assert.ok((await client.listTools()).tools.length > 0);

    await closeClient(client, transport);
  });
});

describe('HTTP transport capacity limit', () => {
  let server: TestServer;

  before(async () => {
    server = await spawnServer({CHROME_DEVTOOLS_MCP_MAX_SESSIONS: '2'});
  });

  after(async () => {
    await server?.stop();
  });

  it('evicts the least-recently-active session when MAX_SESSIONS is exceeded', async () => {
    // With cap=2, the third initialize must force eviction of the oldest.
    // Capacity is a HARD limit, so even an "active" session (open GET stream)
    // is fair game once the cap is breached — that's what protects the server
    // from a flood of connects pinning the map open.
    const c1 = createClient();
    const t1 = createTransport(server.mcpUrl);
    await c1.connect(t1);

    const c2 = createClient();
    const t2 = createTransport(server.mcpUrl);
    await c2.connect(t2);

    // Connecting c3 must trigger removal of c1 (oldest lastActivity).
    const c3 = createClient();
    const t3 = createTransport(server.mcpUrl);
    await c3.connect(t3);

    const health = await getHealth(server.healthUrl);
    assert.ok(
      health.sessions <= 2,
      `cap=2 must be enforced; got ${health.sessions} sessions`,
    );

    // c1 was evicted: its session id is unknown to the server now, so a
    // request carrying it must reject. The exact error shape is up to the SDK
    // — what matters is the call doesn't silently succeed.
    await assert.rejects(
      c1.listTools(),
      'evicted session must reject subsequent requests',
    );

    // c2 and c3 must still work — eviction only touched the oldest.
    assert.ok((await c2.listTools()).tools.length > 0);
    assert.ok((await c3.listTools()).tools.length > 0);

    await closeClient(c2, t2);
    await closeClient(c3, t3);
    // c1's transport is dead server-side; just drop the local socket.
    await t1.close().catch(() => undefined);
  });
});
