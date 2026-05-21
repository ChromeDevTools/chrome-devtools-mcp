/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createServer, type Server} from 'node:http';
import * as net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {after, afterEach, before, beforeEach, describe, it} from 'node:test';

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';

import {
  clearStickySession,
  fetchRemoteHealth,
  getRemoteSessionFilePath,
  invokeRemoteTool,
  loadStickySessionId,
  parseHeaderFlag,
  parseHeaderFlags,
  saveStickySessionId,
  stopRemoteSession,
} from '../../src/daemon/remote-client.js';

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
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

interface Session {
  transport: StreamableHTTPServerTransport;
  receivedHeaders: Record<string, string | string[] | undefined>;
}

interface FixtureServer {
  url: URL;
  /** Most-recent set of request headers — used to verify header forwarding. */
  lastHeaders(): Record<string, string | string[] | undefined> | undefined;
  /** Live sessions, observable by tests. */
  sessions: Map<string, Session>;
  stop(): Promise<void>;
}

/**
 * In-process MCP server speaking the Streamable HTTP transport with a single
 * `echo` tool. Mirrors the shape of chrome-devtools-mcp-main.ts but without
 * any Chrome dependency.
 */
async function startFixtureServer(): Promise<FixtureServer> {
  const port = await getFreePort();
  const sessions = new Map<string, Session>();
  let lastHeaders: Record<string, string | string[] | undefined> | undefined;

  function buildMcpServer(): McpServer {
    const server = new McpServer(
      {name: 'remote-client-fixture', version: '0.0.0'},
      {capabilities: {}},
    );
    server.tool(
      'echo',
      'Echo back the provided text',
      {text: z.string()},
      async ({text}) => ({content: [{type: 'text', text}]}),
    );
    return server;
  }

  const httpServer: Server = createServer(async (req, res) => {
    lastHeaders = req.headers;
    if (req.url?.startsWith('/health')) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({status: 'ok', sessions: sessions.size}));
      return;
    }
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const rawId = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;

    if (sessionId && sessions.has(sessionId)) {
      const s = sessions.get(sessionId)!;
      s.receivedHeaders = req.headers;
      await s.transport.handleRequest(req, res);
      return;
    }

    const body = await new Promise<string>(resolve => {
      let data = '';
      req.on('data', c => (data += c));
      req.on('end', () => resolve(data));
    });
    let parsed: unknown;
    try {
      parsed = body.length ? JSON.parse(body) : undefined;
    } catch {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'bad json'}));
      return;
    }
    const isInit =
      isInitializeRequest(parsed) ||
      (Array.isArray(parsed) && parsed.some(isInitializeRequest));
    if (isInit) {
      const mcp = buildMcpServer();
      // Register the session inside onsessioninitialized — it fires BEFORE the
      // response goes out, so the follow-up `initialized` notification (which
      // may race the initialize response) always finds the session in the map.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: id => {
          sessions.set(id, {transport, receivedHeaders: req.headers});
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };
      await mcp.connect(transport);
      await transport.handleRequest(req, res, parsed);
      return;
    }
    if (sessionId) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {code: -32001, message: 'Session not found'},
          id: null,
        }),
      );
      return;
    }
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {code: -32000, message: 'Bad Request'},
        id: null,
      }),
    );
  });

  await new Promise<void>(resolve => httpServer.listen(port, resolve));

  return {
    url: new URL(`http://127.0.0.1:${port}/mcp`),
    lastHeaders: () => lastHeaders,
    sessions,
    async stop() {
      for (const [, s] of sessions) {
        await s.transport.close().catch(() => undefined);
      }
      sessions.clear();
      await new Promise<void>(resolve => httpServer.close(() => resolve()));
    },
  };
}

describe('remote-client helpers', () => {
  describe('parseHeaderFlag', () => {
    it('parses colon-separated headers', () => {
      assert.deepStrictEqual(parseHeaderFlag('Authorization: Bearer xyz'), [
        'Authorization',
        'Bearer xyz',
      ]);
    });
    it('parses equals-separated headers', () => {
      assert.deepStrictEqual(parseHeaderFlag('X-Token=abc'), [
        'X-Token',
        'abc',
      ]);
    });
    it('prefers the first separator (colon before equals)', () => {
      assert.deepStrictEqual(parseHeaderFlag('X-Foo: a=b'), ['X-Foo', 'a=b']);
    });
    it('rejects values with no separator', () => {
      assert.throws(() => parseHeaderFlag('no-separator'), /Invalid --header/);
    });
    it('rejects an empty header name', () => {
      assert.throws(() => parseHeaderFlag(': value'), /empty header name/);
    });
  });

  describe('parseHeaderFlags', () => {
    it('returns undefined for an empty list', () => {
      assert.strictEqual(parseHeaderFlags([]), undefined);
      assert.strictEqual(parseHeaderFlags(undefined), undefined);
    });
    it('merges multiple values', () => {
      const out = parseHeaderFlags(['Authorization: Bearer t', 'X-Trace: 42']);
      assert.deepStrictEqual(out, {
        Authorization: 'Bearer t',
        'X-Trace': '42',
      });
    });
  });

  describe('sticky session storage', () => {
    let cacheDir: string;
    let originalCacheHome: string | undefined;

    beforeEach(() => {
      cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-cache-'));
      originalCacheHome = process.env['XDG_CACHE_HOME'];
      process.env['XDG_CACHE_HOME'] = cacheDir;
    });

    afterEach(() => {
      if (originalCacheHome === undefined) {
        delete process.env['XDG_CACHE_HOME'];
      } else {
        process.env['XDG_CACHE_HOME'] = originalCacheHome;
      }
      fs.rmSync(cacheDir, {recursive: true, force: true});
    });

    it('round-trips a session id', () => {
      const url = new URL('https://example.test/mcp');
      assert.strictEqual(loadStickySessionId(url), undefined);
      saveStickySessionId(url, 'sess-1');
      assert.strictEqual(loadStickySessionId(url), 'sess-1');
    });

    it('isolates sessions per remote URL', () => {
      const a = new URL('https://a.test/mcp');
      const b = new URL('https://b.test/mcp');
      saveStickySessionId(a, 'A');
      saveStickySessionId(b, 'B');
      assert.strictEqual(loadStickySessionId(a), 'A');
      assert.strictEqual(loadStickySessionId(b), 'B');
      assert.notStrictEqual(
        getRemoteSessionFilePath(a),
        getRemoteSessionFilePath(b),
      );
    });

    it('treats http and https as distinct', () => {
      const http = new URL('http://x.test/mcp');
      const https = new URL('https://x.test/mcp');
      assert.notStrictEqual(
        getRemoteSessionFilePath(http),
        getRemoteSessionFilePath(https),
      );
    });

    it('clearStickySession removes the file', () => {
      const url = new URL('https://example.test/mcp');
      saveStickySessionId(url, 'x');
      clearStickySession(url);
      assert.strictEqual(loadStickySessionId(url), undefined);
    });

    it('writes session files with restrictive permissions', () => {
      if (process.platform === 'win32') {
        return; // mode bits do not apply
      }
      const url = new URL('https://example.test/mcp');
      saveStickySessionId(url, 'secret');
      const stat = fs.statSync(getRemoteSessionFilePath(url));
      assert.strictEqual(stat.mode & 0o777, 0o600);
    });
  });
});

describe('remote-client integration', () => {
  let server: FixtureServer;
  let cacheDir: string;
  let originalCacheHome: string | undefined;

  before(async () => {
    server = await startFixtureServer();
  });

  after(async () => {
    await server.stop();
  });

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-cache-'));
    originalCacheHome = process.env['XDG_CACHE_HOME'];
    process.env['XDG_CACHE_HOME'] = cacheDir;
  });

  afterEach(async () => {
    // Close any lingering sessions between tests so each test starts fresh.
    for (const [, s] of server.sessions) {
      await s.transport.close().catch(() => undefined);
    }
    server.sessions.clear();

    if (originalCacheHome === undefined) {
      delete process.env['XDG_CACHE_HOME'];
    } else {
      process.env['XDG_CACHE_HOME'] = originalCacheHome;
    }
    fs.rmSync(cacheDir, {recursive: true, force: true});
  });

  it('invokes a tool and persists the issued session id', async () => {
    const result = await invokeRemoteTool({
      url: server.url,
      tool: 'echo',
      args: {text: 'hello'},
    });
    const text =
      Array.isArray(result.content) &&
      result.content[0] &&
      'text' in result.content[0]
        ? (result.content[0] as {text: string}).text
        : undefined;
    assert.strictEqual(text, 'hello');
    const persisted = loadStickySessionId(server.url);
    assert.ok(persisted, 'session id should be persisted after invocation');
    assert.ok(
      server.sessions.has(persisted!),
      'persisted id must match a live server session',
    );
  });

  it('reuses the persisted session id across invocations', async () => {
    await invokeRemoteTool({
      url: server.url,
      tool: 'echo',
      args: {text: 'a'},
    });
    const firstId = loadStickySessionId(server.url);
    assert.ok(firstId);
    const sessionsBefore = server.sessions.size;

    await invokeRemoteTool({
      url: server.url,
      tool: 'echo',
      args: {text: 'b'},
    });

    assert.strictEqual(loadStickySessionId(server.url), firstId);
    assert.strictEqual(
      server.sessions.size,
      sessionsBefore,
      'sticky session should not create a new server session',
    );
  });

  it('transparently re-initializes when the persisted session is stale', async () => {
    // Write a bogus session id to disk so the first request lands with an
    // unknown session header. The server must accept the initialize that the
    // client sends, mint a fresh id, and the helper must persist the new one.
    saveStickySessionId(server.url, 'does-not-exist');
    await invokeRemoteTool({
      url: server.url,
      tool: 'echo',
      args: {text: 'after-restart'},
    });
    const fresh = loadStickySessionId(server.url);
    assert.ok(fresh);
    assert.notStrictEqual(fresh, 'does-not-exist');
    assert.ok(server.sessions.has(fresh!));
  });

  it('forwards configured headers to the server', async () => {
    await invokeRemoteTool({
      url: server.url,
      headers: {'X-Test-Token': 'shibboleth'},
      tool: 'echo',
      args: {text: 'h'},
    });
    const seen = server.lastHeaders();
    assert.ok(seen);
    assert.strictEqual(seen!['x-test-token'], 'shibboleth');
  });

  it('stopRemoteSession terminates the server session and clears the local pointer', async () => {
    await invokeRemoteTool({
      url: server.url,
      tool: 'echo',
      args: {text: 'x'},
    });
    const id = loadStickySessionId(server.url);
    assert.ok(id);
    assert.ok(server.sessions.has(id!));

    await stopRemoteSession({url: server.url});

    assert.strictEqual(loadStickySessionId(server.url), undefined);
    // Give the server a tick to process DELETE / onclose.
    await new Promise(r => setTimeout(r, 50));
    assert.ok(!server.sessions.has(id!));
  });

  it('fetchRemoteHealth derives /health from the /mcp endpoint', async () => {
    const health = await fetchRemoteHealth({url: server.url});
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.status, 200);
    assert.deepStrictEqual((health.body as {status: string}).status, 'ok');
  });
});
