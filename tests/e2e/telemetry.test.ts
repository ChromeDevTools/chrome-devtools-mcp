/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {
  execFile,
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import {describe, it} from 'node:test';
import {promisify} from 'node:util';

import type {ChromeDevToolsMcpExtension} from '../../src/telemetry/types';

const execFileAsync = promisify(execFile);

const SERVER_PATH = path.resolve(
  import.meta.dirname,
  '../../src/bin/chrome-devtools-mcp.js',
);

interface MockServerContext {
  server: http.Server;
  port: number;
  events: ChromeDevToolsMcpExtension[];
  watchdogPid?: number;
  waitForEvent: (
    predicate: (event: ChromeDevToolsMcpExtension) => boolean,
  ) => Promise<ChromeDevToolsMcpExtension>;
}

async function startMockServer(): Promise<MockServerContext> {
  const events: ChromeDevToolsMcpExtension[] = [];
  let waitingResolvers: Array<{
    predicate: (event: ChromeDevToolsMcpExtension) => boolean;
    resolve: (event: ChromeDevToolsMcpExtension) => void;
  }> = [];
  let watchdogPid: number | undefined;

  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      const pidHeader = req.headers['x-watchdog-pid'];
      if (pidHeader && !Array.isArray(pidHeader)) {
        watchdogPid = parseInt(pidHeader, 10);
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          // Extract internal log events
          if (parsed.log_event) {
            for (const logEvent of parsed.log_event) {
              if (logEvent.source_extension_json) {
                const ext = JSON.parse(
                  logEvent.source_extension_json,
                ) as ChromeDevToolsMcpExtension;
                events.push(ext);

                // Check if any waiters are satisfied
                waitingResolvers = waitingResolvers.filter(
                  ({predicate, resolve}) => {
                    if (predicate(ext)) {
                      resolve(ext);
                      return false;
                    }
                    return true;
                  },
                );
              }
            }
          }
        } catch (err) {
          console.error('Failed to parse mock server request', err);
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({next_request_wait_millis: 100}));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    port: address.port,
    events,
    get watchdogPid() {
      return watchdogPid;
    },
    waitForEvent: predicate => {
      const existing = events.find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise(resolve => {
        waitingResolvers.push({predicate, resolve});
      });
    },
  };
}

interface TestContext {
  process?: ChildProcess;
  mockServer?: MockServerContext;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(
  pid: number,
  timeoutMs = 5000,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timeout waiting for process ${pid} to exit`);
}

function cleanupTest(ctx: TestContext): void {
  // Kill Main Process
  if (ctx.process && ctx.process.exitCode === null) {
    try {
      ctx.process.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
  // Kill Watchdog Process
  if (ctx.mockServer?.watchdogPid) {
    try {
      process.kill(ctx.mockServer.watchdogPid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
  // Stop Mock Server
  if (ctx.mockServer) {
    ctx.mockServer.server.close();
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  message: string,
  timeoutMs = 10000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

interface McpStdioClient {
  request(method: string, params: Record<string, unknown>): Promise<void>;
  notify(method: string): void;
}

function createMcpStdioClient(child: ChildProcess): McpStdioClient {
  const {stdin, stdout} = child;
  assert.ok(stdin && stdout, 'Server stdio is not piped');
  const pending = new Map<number, () => void>();
  let nextId = 1;
  readline.createInterface({input: stdout}).on('line', line => {
    try {
      const message: {id?: unknown} = JSON.parse(line);
      if (typeof message.id === 'number') {
        pending.get(message.id)?.();
        pending.delete(message.id);
      }
    } catch {
      // Ignore lines that are not JSON-RPC messages.
    }
  });
  return {
    request(method, params) {
      const id = nextId++;
      return new Promise(resolve => {
        pending.set(id, resolve);
        stdin.write(
          JSON.stringify({jsonrpc: '2.0', id, method, params}) + '\n',
        );
      });
    },
    notify(method) {
      stdin.write(JSON.stringify({jsonrpc: '2.0', method}) + '\n');
    },
  };
}

async function initializeMcp(client: McpStdioClient): Promise<void> {
  await withTimeout(
    client.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {name: 'telemetry-e2e', version: '1.0.0'},
    }),
    'Timeout waiting for initialize',
  );
  client.notify('notifications/initialized');
}

// Checks whether the server process has a telemetry watchdog child.
async function hasWatchdogChild(serverPid: number): Promise<boolean> {
  try {
    await execFileAsync('pgrep', [
      '-P',
      serverPid.toString(),
      '-f',
      'watchdog/main.js',
    ]);
    return true;
  } catch (error) {
    // pgrep exits with 1 when no process matches.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 1
    ) {
      return false;
    }
    throw error;
  }
}

function spawnServer(
  mockContext: MockServerContext,
  spawnOptions?: SpawnOptions,
): ChildProcess {
  return spawn(
    process.execPath,
    [
      SERVER_PATH,
      '--usage-statistics',
      // Tool calls fail fast without launching Chrome.
      '--browserUrl=http://127.0.0.1:1',
      `--clearcutEndpoint=http://127.0.0.1:${mockContext.port}`,
      '--clearcutForceFlushIntervalMs=10',
      '--clearcutIncludePidHeader',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: undefined,
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: undefined,
      },
      ...spawnOptions,
    },
  );
}

describe('Telemetry E2E', () => {
  async function runTelemetryTest(
    killFn: (ctx: TestContext) => void,
    spawnOptions?: SpawnOptions,
  ): Promise<void> {
    const mockContext = await startMockServer();
    const ctx: TestContext = {
      mockServer: mockContext,
    };

    try {
      ctx.process = spawnServer(mockContext, spawnOptions);

      const startEvent = await withTimeout(
        mockContext.waitForEvent(e => e.server_start !== undefined),
        'Timeout waiting for server_start',
      );
      assert.ok(startEvent.session_id, 'server_start has no session_id');

      // The server sends server_start itself, so no watchdog request yet.
      assert.strictEqual(
        mockContext.watchdogPid,
        undefined,
        'server_start should not be sent by the watchdog',
      );

      // The first tool call starts the watchdog.
      const client = createMcpStdioClient(ctx.process);
      await initializeMcp(client);
      void client.request('tools/call', {name: 'list_pages', arguments: {}});
      const toolEvent = await withTimeout(
        mockContext.waitForEvent(e => e.tool_invocation !== undefined),
        'Timeout waiting for tool_invocation',
      );
      assert.strictEqual(
        toolEvent.session_id,
        startEvent.session_id,
        'tool_invocation should share the session_id of server_start',
      );

      // The watchdog sends tool_invocation with its PID in the headers.
      const watchdogPid = mockContext.watchdogPid;
      assert.ok(watchdogPid, 'Watchdog PID not captured from headers');
      assert.strictEqual(
        isProcessAlive(watchdogPid),
        true,
        'Watchdog process should be running',
      );

      // Trigger shutdown
      killFn(ctx);

      // Verify shutdown event
      const shutdownEvent = await withTimeout(
        mockContext.waitForEvent(e => e.server_shutdown !== undefined),
        'Timeout waiting for server_shutdown',
      );
      assert.strictEqual(
        shutdownEvent.session_id,
        startEvent.session_id,
        'server_shutdown should share the session_id of server_start',
      );

      // Wait for Watchdog to exit naturally
      await waitForProcessExit(watchdogPid);
    } finally {
      cleanupTest(ctx);
    }
  }

  it('handles SIGKILL', () =>
    runTelemetryTest(ctx => {
      ctx.process!.kill('SIGKILL');
    }));

  it('handles SIGTERM', () =>
    runTelemetryTest(ctx => {
      ctx.process!.kill('SIGTERM');
    }));

  it(
    'handles POSIX process group SIGTERM',
    {skip: process.platform === 'win32'},
    () =>
      runTelemetryTest(
        ctx => {
          process.kill(-ctx.process!.pid!, 'SIGTERM');
        },
        {detached: true},
      ),
  );

  it(
    'starts the watchdog on the first tool call, not when idle',
    {skip: process.platform === 'win32'},
    async () => {
      const mockContext = await startMockServer();
      const ctx: TestContext = {
        mockServer: mockContext,
      };

      try {
        const serverProcess = spawnServer(mockContext);
        ctx.process = serverProcess;
        const serverPid = serverProcess.pid;
        assert.ok(serverPid, 'Server process has no PID');

        const client = createMcpStdioClient(serverProcess);
        await initializeMcp(client);
        await withTimeout(
          client.request('tools/list', {}),
          'Timeout waiting for tools/list',
        );
        await withTimeout(
          mockContext.waitForEvent(e => e.server_start !== undefined),
          'Timeout waiting for server_start',
        );
        assert.strictEqual(
          await hasWatchdogChild(serverPid),
          false,
          'Idle server should not start the watchdog',
        );

        void client.request('tools/call', {name: 'list_pages', arguments: {}});
        await withTimeout(
          mockContext.waitForEvent(e => e.tool_invocation !== undefined),
          'Timeout waiting for tool_invocation',
        );
        assert.strictEqual(
          await hasWatchdogChild(serverPid),
          true,
          'Watchdog should run after the first tool call',
        );
      } finally {
        cleanupTest(ctx);
      }
    },
  );
});
