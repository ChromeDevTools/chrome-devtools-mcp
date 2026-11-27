/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawn, type ChildProcess} from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import {describe, it} from 'node:test';

const SERVER_PATH = path.resolve(
  import.meta.dirname,
  '../../src/bin/chrome-devtools-mcp.js',
);

const PROTOCOL_VERSION = '2026-07-28';
const LISTENING_URL_PATTERN =
  /Chrome DevTools MCP HTTP server listening on (http:\/\/\S+)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withTimeout<T>(
  promise: Promise<T>,
  message: string,
  timeoutMs = 10_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

function waitForListeningUrl(
  child: ChildProcess,
): Promise<{url: string; stderrLines: string[]}> {
  const {stderr} = child;
  assert.ok(stderr, 'Expected stderr pipe on spawned HTTP server');

  const stderrLines: string[] = [];
  return withTimeout(
    new Promise((resolve, reject) => {
      const rl = readline.createInterface({input: stderr});
      const cleanup = (): void => {
        rl.close();
        child.off('exit', onExit);
        child.off('error', onError);
      };
      const onExit = (
        code: number | null,
        signal: NodeJS.Signals | null,
      ): void => {
        cleanup();
        reject(
          new Error(
            `HTTP server exited before listening (code=${String(code)}, signal=${String(signal)}):\n${stderrLines.join('\n')}`,
          ),
        );
      };
      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };
      child.once('exit', onExit);
      child.once('error', onError);
      rl.on('line', line => {
        stderrLines.push(line);
        const match = LISTENING_URL_PATTERN.exec(line);
        if (match) {
          cleanup();
          resolve({url: match[1], stderrLines});
        }
      });
    }),
    'Timed out waiting for HTTP server listening URL on stderr',
    10_000,
  );
}

async function discover(
  url: string,
  id: number,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Method': 'server/discover',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'server/discover',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': {
            name: 'http-e2e-test',
            version: '1.0.0',
          },
        },
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(response.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(response.headers.get('cache-control'), 'no-store');
  const body: unknown = await response.json();
  assert.ok(isRecord(body), 'Expected JSON object from server/discover');
  return body;
}

describe('HTTP transport E2E', () => {
  it('stays alive with closed stdin, serves server/discover, and exits cleanly on SIGTERM', async () => {
    const child = spawn(
      process.execPath,
      [
        SERVER_PATH,
        '--transport',
        'http',
        '--port',
        '0',
        '--no-usage-statistics',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
        },
      },
    );

    try {
      const {url} = await waitForListeningUrl(child);
      assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

      const firstDiscover = await discover(url, 1);
      assert.strictEqual(firstDiscover['id'], 1);
      assert.ok(isRecord(firstDiscover['result']));

      assert.strictEqual(
        child.exitCode,
        null,
        'HTTP server should stay alive with closed stdin',
      );

      const secondDiscover = await discover(url, 2);
      assert.strictEqual(secondDiscover['id'], 2);
      assert.ok(isRecord(secondDiscover['result']));

      const exitPromise = withTimeout(
        new Promise<{code: number | null; signal: NodeJS.Signals | null}>(
          resolve => {
            child.once('exit', (code, signal) => {
              resolve({code, signal});
            });
          },
        ),
        'Timed out waiting for HTTP server to exit on SIGTERM',
        10_000,
      );

      child.kill('SIGTERM');
      const exit = await exitPromise;
      if (process.platform === 'win32') {
        assert.ok(exit.code === 0 || exit.signal === 'SIGTERM');
      } else {
        assert.strictEqual(exit.code, 0);
        assert.strictEqual(exit.signal, null);
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }
  });
});
