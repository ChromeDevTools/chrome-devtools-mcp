/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const EXTENSION_SW_PATH = path.join(
  import.meta.dirname,
  '../../tests/tools/fixtures/extension-sw',
);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result)) {
    return '';
  }
  const {content} = result as {
    content?: Array<{type: string; text?: string}>;
  };
  return (content ?? [])
    .filter((item: {type: string}) => item.type === 'text')
    .map((item: {text?: string}) => item.text ?? '')
    .join('\n');
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine free port'));
        return;
      }
      const {port} = address;
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function waitFor<T>(
  fn: () => Promise<T | null>,
  timeoutMs = 15000,
): Promise<T> {
  const endTime = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < endTime) {
    try {
      const result = await fn();
      if (result !== null) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `Timed out waiting for condition${lastError ? `: ${String(lastError)}` : ''}`,
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.json();
}

async function createPopupTarget(
  port: number,
  extensionId: string,
): Promise<void> {
  const version = (await fetchJson(
    `http://127.0.0.1:${port}/json/version`,
  )) as {
    webSocketDebuggerUrl: string;
  };
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Target.createTarget',
          params: {
            url: `chrome-extension://${extensionId}/popup.html`,
            newWindow: true,
            width: 400,
            height: 600,
          },
        }),
      );
    };
    ws.onmessage = event => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        error?: {message: string};
      };
      if (message.id !== 1) {
        return;
      }
      ws.close();
      if (message.error) {
        reject(new Error(message.error.message));
        return;
      }
      resolve();
    };
    ws.onerror = event => {
      reject(new Error(`WebSocket error: ${String(event.type)}`));
    };
  });
}

async function withConnectedClient(
  cb: (client: Client, extensionId: string) => Promise<void>,
): Promise<void> {
  const port = await getFreePort();
  const userDataDir = await mkdtemp(
    path.join(os.tmpdir(), 'cdmcp-connected-extensions-'),
  );
  const chromePath = process.env.CHROME_M146_EXECUTABLE_PATH;
  assert.ok(chromePath, 'CHROME_M146_EXECUTABLE_PATH must be set');

  const browserProcess = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--enable-unsafe-extension-debugging',
      `--disable-extensions-except=${EXTENSION_SW_PATH}`,
      `--load-extension=${EXTENSION_SW_PATH}`,
    ],
    {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
    },
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      'build/src/bin/chrome-devtools-mcp.js',
      '--browserUrl',
      `http://127.0.0.1:${port}`,
      '--categoryExtensions',
      '--no-usage-statistics',
    ],
  });
  const client = new Client(
    {
      name: 'connected-browser-extensions-test',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  try {
    await waitFor(async () => {
      return (await fetchJson(
        `http://127.0.0.1:${port}/json/version`,
      )) as Record<string, unknown>;
    });
    const serviceWorker = await waitFor(async () => {
      const targets = (await fetchJson(
        `http://127.0.0.1:${port}/json/list`,
      )) as Array<{type: string; url: string}>;
      return (
        targets.find(
          target =>
            target.type === 'service_worker' &&
            target.url.startsWith('chrome-extension://') &&
            target.url.endsWith('/sw.js'),
        ) ?? null
      );
    });
    const extensionId = new URL(serviceWorker.url).host;

    await createPopupTarget(port, extensionId);
    await waitFor(async () => {
      const targets = (await fetchJson(
        `http://127.0.0.1:${port}/json/list`,
      )) as Array<{type: string; url: string}>;
      return (
        targets.find(
          target =>
            target.type === 'page' &&
            target.url === `chrome-extension://${extensionId}/popup.html`,
        ) ?? null
      );
    });

    await client.connect(transport);
    await cb(client, extensionId);
  } finally {
    await client.close().catch(() => undefined);
    try {
      process.kill(-browserProcess.pid!, 'SIGKILL');
    } catch {
      browserProcess.kill('SIGKILL');
    }
    await Promise.race([once(browserProcess, 'exit'), delay(3000)]).catch(
      () => undefined,
    );
    await rm(userDataDir, {recursive: true, force: true, maxRetries: 10});
  }
}

describe('connected browser extension pages', () => {
  it('lists extension popup pages without exposing extension management tools', async () => {
    await withConnectedClient(async (client, extensionId) => {
      const {tools} = await client.listTools();
      assert.ok(tools.find(tool => tool.name === 'list_pages'));
      assert.ok(!tools.find(tool => tool.name === 'install_extension'));
      assert.ok(!tools.find(tool => tool.name === 'trigger_extension_action'));

      const listPagesResult = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      const listPagesText = getText(listPagesResult);
      assert.match(listPagesText, /## Extension Pages/);
      assert.match(
        listPagesText,
        new RegExp(
          `(\\d+): chrome-extension://${escapeRegex(extensionId)}/popup\\.html(?: \\[selected\\])?`,
        ),
      );

      const popupPageMatch = listPagesText.match(
        new RegExp(
          `(\\d+): chrome-extension://${escapeRegex(extensionId)}/popup\\.html`,
        ),
      );
      assert.ok(popupPageMatch, 'Popup page should be listed');

      await client.callTool({
        name: 'select_page',
        arguments: {pageId: Number(popupPageMatch[1])},
      });
      const snapshotResult = await client.callTool({
        name: 'take_snapshot',
        arguments: {},
      });
      const snapshotText = getText(snapshotResult);
      assert.match(snapshotText, /Extension With Service Worker/);
    });
  });
});
