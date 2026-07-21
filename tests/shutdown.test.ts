/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import type {ChildProcessByStdio} from 'node:child_process';
import {spawn} from 'node:child_process';
import type {Readable, Writable} from 'node:stream';
import {describe, it} from 'node:test';

import {executablePath} from 'puppeteer';

type Server = ChildProcessByStdio<Writable, Readable, Readable>;

// Once shutdown is signalled, the server should be fully gone within this
// budget. The actual fast path is well under 500ms; the budget is set to be
// generous against CI noise without being so loose that it would hide a hang.
const SHUTDOWN_BUDGET_MS = 10000;
// Outer test timeout. If exit doesn't happen within this, treat as a hang
// (the bug we're guarding against) and SIGKILL the subprocess.
const EXIT_TIMEOUT_MS = 15000;

async function spawnServer(): Promise<Server> {
  const child = spawn(
    'node',
    [
      'build/src/bin/chrome-devtools-mcp.js',
      '--headless',
      '--isolated',
      '--executable-path',
      await executablePath(),
    ],
    {
      env: {
        ...process.env,
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  ) as Server;
  // Drain stderr to avoid pipe-buffer backpressure stalling the server.
  child.stderr.on('data', () => {
    // discard
  });
  return child;
}

async function waitForExit(
  child: Server,
  timeoutMs: number,
): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  elapsedMs: number;
}> {
  const start = Date.now();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`server did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({code, signal, elapsedMs: Date.now() - start});
    });
  });
}

async function rpc(
  child: Server,
  msg: {method: string; params?: unknown},
): Promise<unknown> {
  const id = Math.floor(Math.random() * 1e9);
  const payload = JSON.stringify({jsonrpc: '2.0', id, ...msg}) + '\n';
  return await new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        try {
          const parsed = JSON.parse(line) as {id?: number};
          if (parsed.id === id) {
            child.stdout.off('data', onData);
            resolve(parsed);
            return;
          }
        } catch {
          // Not a JSON message; ignore.
        }
      }
    };
    child.stdout.on('data', onData);
    const onExit = () => {
      child.stdout.off('data', onData);
      reject(new Error('server exited before RPC response'));
    };
    child.once('exit', onExit);
    child.stdin.write(payload);
  });
}

function notify(child: Server, msg: {method: string; params?: unknown}): void {
  child.stdin.write(JSON.stringify({jsonrpc: '2.0', ...msg}) + '\n');
}

async function initializeAndLaunchBrowser(child: Server): Promise<void> {
  await rpc(child, {
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {name: 'shutdown-test', version: '0.0.1'},
    },
  });
  notify(child, {method: 'notifications/initialized'});
  // navigate_page forces a real Chrome launch — this is what reproduces
  // the hang in #2116. Without an active Chrome subprocess, stdin EOF
  // would close the event loop on its own and shutdown would look fine
  // even with broken handlers.
  await rpc(child, {
    method: 'tools/call',
    params: {
      name: 'navigate_page',
      arguments: {url: 'about:blank'},
    },
  });
}

describe('shutdown', () => {
  it('exits within budget on stdin EOF after Chrome launch', async () => {
    const child = await spawnServer();
    await initializeAndLaunchBrowser(child);
    child.stdin.end();
    const {elapsedMs} = await waitForExit(child, EXIT_TIMEOUT_MS);
    assert.ok(
      elapsedMs < SHUTDOWN_BUDGET_MS,
      `stdin-EOF shutdown took ${elapsedMs}ms (budget ${SHUTDOWN_BUDGET_MS}ms)`,
    );
  });

  it('exits within budget on SIGTERM after Chrome launch', async () => {
    const child = await spawnServer();
    await initializeAndLaunchBrowser(child);
    child.kill('SIGTERM');
    const {elapsedMs} = await waitForExit(child, EXIT_TIMEOUT_MS);
    assert.ok(
      elapsedMs < SHUTDOWN_BUDGET_MS,
      `SIGTERM shutdown took ${elapsedMs}ms (budget ${SHUTDOWN_BUDGET_MS}ms)`,
    );
  });

  it('exits within budget on SIGINT after Chrome launch', async () => {
    const child = await spawnServer();
    await initializeAndLaunchBrowser(child);
    child.kill('SIGINT');
    const {elapsedMs} = await waitForExit(child, EXIT_TIMEOUT_MS);
    assert.ok(
      elapsedMs < SHUTDOWN_BUDGET_MS,
      `SIGINT shutdown took ${elapsedMs}ms (budget ${SHUTDOWN_BUDGET_MS}ms)`,
    );
  });

  it('exits within budget on SIGHUP after Chrome launch', async () => {
    const child = await spawnServer();
    await initializeAndLaunchBrowser(child);
    child.kill('SIGHUP');
    const {elapsedMs} = await waitForExit(child, EXIT_TIMEOUT_MS);
    assert.ok(
      elapsedMs < SHUTDOWN_BUDGET_MS,
      `SIGHUP shutdown took ${elapsedMs}ms (budget ${SHUTDOWN_BUDGET_MS}ms)`,
    );
  });
});
