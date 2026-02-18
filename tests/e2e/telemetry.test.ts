/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawn, type ChildProcess, type SpawnOptions} from 'node:child_process';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import {describe, it} from 'node:test';

import type {ChromeDevToolsMcpExtension} from '../../src/telemetry/types';

const SERVER_PATH = path.resolve('build/src/main.js');

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
      ctx.process = spawn(
        process.execPath,
        [
          SERVER_PATH,
          '--usage-statistics',
          '--headless',
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

      const startEvent = await Promise.race([
        mockContext.waitForEvent(e => e.server_start !== undefined),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Timeout waiting for server_start')),
            10000,
          ),
        ),
      ]);
      assert.ok(startEvent, 'server_start event not received');

      // Now that we received an event, we should have the Watchdog PID
      const watchdogPid = mockContext.watchdogPid;
      assert.ok(watchdogPid, 'Watchdog PID not captured from headers');

      // Assert Watchdog is actually running
      assert.strictEqual(
        isProcessAlive(watchdogPid),
        true,
        'Watchdog process should be running',
      );

      // Trigger shutdown
      killFn(ctx);

      // Verify shutdown event
      const shutdownEvent = await Promise.race([
        mockContext.waitForEvent(e => e.server_shutdown !== undefined),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Timeout waiting for server_shutdown')),
            10000,
          ),
        ),
      ]);
      assert.ok(shutdownEvent, 'server_shutdown event not received');

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
});
