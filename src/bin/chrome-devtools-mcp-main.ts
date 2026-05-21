/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../polyfill.js';

import {randomUUID} from 'node:crypto';
import {createServer, type ServerResponse} from 'node:http';
import process from 'node:process';

import {createMcpServer, logDisclaimers} from '../index.js';
import {logger, saveLogsToFile} from '../logger.js';
import {Mutex} from '../Mutex.js';
import {ClearcutLogger} from '../telemetry/ClearcutLogger.js';
import {computeFlagUsage} from '../telemetry/flagUtils.js';
import {FilePersistence} from '../telemetry/persistence.js';
import {
  StdioServerTransport,
  StreamableHTTPServerTransport,
  isInitializeRequest,
} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {VERSION} from '../version.js';

import {cliOptions, parseArguments} from './chrome-devtools-mcp-cli-options.js';

await checkForUpdates(
  'Run `npm install chrome-devtools-mcp@latest` to update.',
);

export const args = parseArguments(VERSION);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

// Telemetry is process-scoped, not server-scoped. Initialize it once here so
// that in HTTP mode (where an McpServer is created per session) it is ready
// before any session connects and the server-start event is recorded.
if (args.usageStatistics) {
  ClearcutLogger.initialize({
    persistence: new FilePersistence(),
    logFile: args.logFile,
    appVersion: VERSION,
    clearcutEndpoint: args.clearcutEndpoint,
    clearcutForceFlushIntervalMs: args.clearcutForceFlushIntervalMs,
    clearcutIncludePidHeader: args.clearcutIncludePidHeader,
  });
}

if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] !== 'true') {
  process.on('unhandledRejection', (reason, promise) => {
    logger('Unhandled promise rejection', promise, reason);
  });
}

logger(`Starting Chrome DevTools MCP Server v${VERSION}`);

if (args.port) {
  // Each MCP session owns its own McpServer + McpContext but shares one
  // browser. `dispose` releases that session's collectors/listeners when it
  // disconnects. Holding multiple entries concurrently is expected — a new
  // session no longer evicts existing ones.
  interface Session {
    transport: StreamableHTTPServerTransport;
    dispose: () => void;
    /** Epoch ms of the last request routed to this session; drives reaping. */
    lastActivity: number;
    /**
     * Requests currently being handled (POSTs in flight + the long-lived GET
     * SSE stream while a client holds it open). The reaper must not touch a
     * session with work in flight — that would dispose the McpContext under
     * the handler's feet, or kill the notification stream of a client that is
     * connected and just idle.
     */
    activeRequests: number;
  }
  const sessions = new Map<string, Session>();

  // The Streamable HTTP client SDK does not send an MCP DELETE on close() — it
  // just drops the connection. Without the old "evict on initialize" behaviour
  // nothing would ever reclaim those sessions, so the server reaps them itself:
  // idle sessions are terminated after a TTL, and a hard cap bounds memory even
  // under a flood of connects. Both are overridable via env for tests/tuning.
  function readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
  const SESSION_IDLE_TTL_MS = readPositiveIntEnv(
    'CHROME_DEVTOOLS_MCP_SESSION_IDLE_TTL_MS',
    10 * 60_000,
  );
  const MAX_SESSIONS = readPositiveIntEnv(
    'CHROME_DEVTOOLS_MCP_MAX_SESSIONS',
    100,
  );

  // One mutex shared across every session. Sessions share a single browser,
  // so tool execution must stay globally serialized even though each session
  // has its own McpServer.
  const toolMutex = new Mutex();

  // Remove a session and release its resources. Idempotent: the map entry is
  // deleted synchronously up front, so a re-entrant call (e.g. the transport's
  // own onclose firing from the close() below) is a harmless no-op. This is
  // the single place a session is torn down — reaping, capacity eviction and
  // client-initiated DELETE all funnel through here.
  function removeSession(id: string, reason: string): void {
    const session = sessions.get(id);
    if (!session) {
      return;
    }
    sessions.delete(id);
    console.error(
      `[HTTP] session removed: ${id} (${reason}, remaining: ${sessions.size})`,
    );
    try {
      session.dispose();
    } catch (err) {
      logger(`Error disposing session ${id}:`, err);
    }
    void session.transport.close().catch(err => {
      logger(`Error closing transport for session ${id}:`, err);
    });
  }

  // Periodically reap sessions with no traffic for longer than the TTL. This
  // is the only thing that reclaims clients that vanished without an MCP
  // DELETE (crash, network loss, SDK close()). unref() so it never keeps the
  // process alive on its own.
  const reaper = setInterval(
    () => {
      const cutoff = Date.now() - SESSION_IDLE_TTL_MS;
      for (const [id, session] of sessions) {
        // A session with work in flight (POST being handled, or the GET SSE
        // stream still open) is NOT idle even if lastActivity is stale —
        // skip it. Capacity eviction is the only path that can override this
        // and still claim an active session, since the cap is a hard limit.
        if (session.activeRequests === 0 && session.lastActivity < cutoff) {
          removeSession(id, 'idle');
        }
      }
    },
    Math.min(SESSION_IDLE_TTL_MS, 60_000),
  );
  reaper.unref();

  // Send a JSON-RPC 2.0 error response. Using the JSON-RPC envelope (rather
  // than an ad-hoc {error: '...'} object) matches what StreamableHTTPServerTransport
  // itself emits, so clients see a consistent shape on every failure path.
  function sendJsonRpcError(
    res: ServerResponse,
    httpStatus: number,
    code: number,
    message: string,
  ): void {
    if (res.headersSent) {
      return;
    }
    res.writeHead(httpStatus, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({jsonrpc: '2.0', error: {code, message}, id: null}));
  }

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${args.port}`);
    console.error(
      `[HTTP] ${req.method} ${url.pathname} session=${req.headers['mcp-session-id'] ?? 'none'} accept=${req.headers['accept'] ?? 'none'}`,
    );
    if (url.pathname === '/mcp') {
      const rawSessionId = req.headers['mcp-session-id'];
      const sessionId = Array.isArray(rawSessionId)
        ? rawSessionId[0]
        : rawSessionId;

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        if (session) {
          console.error(`[HTTP] routing to existing session ${sessionId}`);
          // Track in-flight work so the reaper doesn't tear the session down
          // mid-handler. Bumping lastActivity in finally too means a slow tool
          // call doesn't get reaped just because its request arrived long ago.
          session.lastActivity = Date.now();
          session.activeRequests++;
          try {
            await session.transport.handleRequest(req, res);
          } finally {
            session.activeRequests--;
            session.lastActivity = Date.now();
          }
          return;
        }
      }

      // Requests for a known session were already routed above. Anything
      // reaching here is either a fresh initialize or a request for a session
      // we don't have. Parse the body defensively: GET (SSE) and DELETE
      // (teardown) requests carry no body, and a malformed body must not throw
      // out of this async handler — that would leave the request hanging with
      // no response.
      const body = await new Promise<string>(resolve => {
        let data = '';
        req.on('data', chunk => (data += chunk));
        req.on('end', () => resolve(data));
      });

      let jsonBody: unknown;
      let parseError = false;
      try {
        jsonBody = body.length > 0 ? JSON.parse(body) : undefined;
      } catch {
        parseError = true;
      }

      const isInitialize =
        !parseError &&
        (isInitializeRequest(jsonBody) ||
          (Array.isArray(jsonBody) && jsonBody.some(isInitializeRequest)));

      if (isInitialize) {
        // Each initialize creates an independent session: its own McpServer
        // and McpContext over the shared browser. Sessions no longer evict
        // one another, so concurrent initializes need no serialization —
        // browser launch stays serialized by the shared tool mutex.
        try {
          const {server, dispose} = await createMcpServer(args, {
            logFile,
            toolMutex,
          });

          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });
          // Fires on a client-initiated DELETE or any transport-level close.
          // removeSession is idempotent, so a close() we triggered ourselves
          // (reaping/capacity) re-entering here is a safe no-op.
          transport.onclose = () => {
            const id = [...sessions.entries()].find(
              ([, s]) => s.transport === transport,
            )?.[0];
            if (id) {
              removeSession(id, 'client-closed');
            }
          };
          await server.connect(transport);
          await transport.handleRequest(req, res, jsonBody);
          // transport.sessionId is a public getter on StreamableHTTPServerTransport
          const respSessionId =
            transport.sessionId ??
            ((): string | undefined => {
              const h = res.getHeader('mcp-session-id');
              return typeof h === 'string' ? h : undefined;
            })();
          if (respSessionId) {
            sessions.set(respSessionId, {
              transport,
              dispose,
              lastActivity: Date.now(),
              activeRequests: 0,
            });
            console.error(
              `[HTTP] new session registered: ${respSessionId} (total: ${sessions.size})`,
            );
            // Enforce the cap by evicting the least-recently-active session.
            // removeSession deletes synchronously, so the loop makes progress.
            while (sessions.size > MAX_SESSIONS) {
              let oldestId: string | undefined;
              let oldest = Infinity;
              for (const [id, s] of sessions) {
                if (id !== respSessionId && s.lastActivity < oldest) {
                  oldest = s.lastActivity;
                  oldestId = id;
                }
              }
              if (!oldestId) {
                break;
              }
              removeSession(oldestId, 'capacity');
            }
          } else {
            // No session ID was issued — the connection is unusable. Dispose
            // immediately so the McpContext is not leaked.
            dispose();
            console.error(`[HTTP] WARNING: no session ID after initialize`);
          }
        } catch (err) {
          logger('Error handling initialize request:', err);
          if (!res.headersSent) {
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Internal server error'}));
          }
        }
      } else if (sessionId) {
        // Session ID present but unknown to this process — almost always a
        // session that died with a server restart. 404 is the Streamable HTTP
        // spec signal that tells a conformant client to start a new session.
        console.error(
          `[HTTP] 404 unknown session: ${sessionId} (known: ${[...sessions.keys()].join(', ')})`,
        );
        sendJsonRpcError(res, 404, -32001, 'Session not found');
      } else if (parseError) {
        console.error(
          `[HTTP] 400 unparseable body (method=${req.method}, length=${body.length})`,
        );
        sendJsonRpcError(res, 400, -32700, 'Parse error: invalid JSON');
      } else {
        console.error(`[HTTP] 400 missing session id, method=${req.method}`);
        sendJsonRpcError(
          res,
          400,
          -32000,
          'Bad Request: Mcp-Session-Id header is required',
        );
      }
    } else if (url.pathname === '/health') {
      // Health check: verify Chrome is still reachable
      try {
        let chromeRunning = false;

        if (args.browserUrl) {
          // When using --browserUrl, check Chrome's HTTP endpoint directly
          const http = await import('node:http');
          chromeRunning = await new Promise<boolean>(resolve => {
            const checkUrl = new URL(
              '/json/version',
              args.browserUrl as string,
            );
            const checkReq = http.get(checkUrl, {timeout: 2000}, checkRes => {
              resolve(checkRes.statusCode === 200);
              checkRes.resume();
            });
            checkReq.on('error', () => resolve(false));
            checkReq.on('timeout', () => {
              checkReq.destroy();
              resolve(false);
            });
          });
        } else {
          // Fallback: check DevToolsActivePort file
          const fs = await import('node:fs');
          const path = await import('node:path');
          const homeDir = process.env['HOME'] || '/tmp';
          const platform = process.platform;
          let userDataDir: string;
          if (platform === 'darwin') {
            userDataDir = path.join(
              homeDir,
              'Library',
              'Application Support',
              'Google',
              'Chrome',
            );
          } else {
            userDataDir = path.join(homeDir, '.config', 'google-chrome');
          }
          const portFile = path.join(userDataDir, 'DevToolsActivePort');
          chromeRunning = fs.existsSync(portFile);
        }

        const status = chromeRunning ? 'ok' : 'error';
        res.writeHead(chromeRunning ? 200 : 503, {
          'Content-Type': 'application/json',
        });
        res.end(
          JSON.stringify({
            status,
            chrome_connected: chromeRunning,
            sessions: sessions.size,
            ...(chromeRunning ? {} : {error: 'Chrome is not reachable'}),
          }),
        );
      } catch (err) {
        res.writeHead(503, {'Content-Type': 'application/json'});
        res.end(
          JSON.stringify({
            status: 'error',
            chrome_connected: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    } else {
      res.writeHead(404);
      res.end('Not found. Use /mcp endpoint.');
    }
  });

  httpServer.listen(args.port, () => {
    logger(
      `Chrome DevTools MCP Server listening on http://localhost:${args.port}/mcp`,
    );
    console.error(
      `Chrome DevTools MCP Server listening on http://localhost:${args.port}/mcp`,
    );
  });
} else {
  // Stdio mode is inherently single-session: one client, one McpServer.
  const {server} = await createMcpServer(args, {logFile});
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

logger('Chrome DevTools MCP Server connected');
logDisclaimers(args);
void ClearcutLogger.get()?.logDailyActiveIfNeeded();
void ClearcutLogger.get()?.logServerStart(computeFlagUsage(args, cliOptions));
