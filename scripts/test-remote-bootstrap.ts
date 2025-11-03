/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const DEFAULT_BROWSER_URL = 'http://127.0.0.1:9222';
const DEFAULT_FIRST_TOOL_TIMEOUT_MS = 10_000;
const DEFAULT_LIST_PAGES_TIMEOUT_MS = 2_000;
const REQUIRED_LOG_LINES = [
  'bootstrap: setDiscoverTargets',
  'bootstrap: setAutoAttach',
  'bootstrap: waiting for first page or timeout',
];

function getElapsedMilliseconds(start: bigint): number {
  const diff = process.hrtime.bigint() - start;
  return Number(diff / BigInt(1_000_000));
}

async function wait(ms: number) {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const browserUrl = process.env.REMOTE_CHROME_URL ?? DEFAULT_BROWSER_URL;
  const bootstrapTimeoutMs = Number(
    process.env.BOOTSTRAP_TIMEOUT_MS ?? 2_000,
  );
  const logDir =
    process.env.MCP_LOG_DIR ?? path.join(process.cwd(), 'tmp', 'logs');
  await fs.mkdir(logDir, {recursive: true});
  const logFile = path.join(
    logDir,
    `remote-bootstrap-${Date.now()}.log`,
  );

  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'build/src/index.js',
      '--browserUrl',
      browserUrl,
      '--bootstrapTimeoutMs',
      String(bootstrapTimeoutMs),
      '--logFile',
      logFile,
    ],
  });

  const client = new Client(
    {
      name: 'remote-bootstrap-test',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  try {
    await assertBrowserReachable(browserUrl);
    await client.connect(transport);

    // First tool: select_page to avoid list_pages at startup.
    const firstToolStart = process.hrtime.bigint();
    await client.callTool({
      name: 'select_page',
      arguments: {pageIdx: 0},
    });
    const firstToolDuration = getElapsedMilliseconds(firstToolStart);
    assert(
      firstToolDuration <= DEFAULT_FIRST_TOOL_TIMEOUT_MS,
      `First tool took ${firstToolDuration}ms (> ${DEFAULT_FIRST_TOOL_TIMEOUT_MS}ms).`,
    );

    // list_pages should complete quickly and exclude extension/devtools URLs.
    const listPagesStart = process.hrtime.bigint();
    const listPagesResult = await client.callTool({
      name: 'list_pages',
      arguments: {},
    });
    const listPagesDuration = getElapsedMilliseconds(listPagesStart);
    assert(
      listPagesDuration <= DEFAULT_LIST_PAGES_TIMEOUT_MS,
      `list_pages took ${listPagesDuration}ms (> ${DEFAULT_LIST_PAGES_TIMEOUT_MS}ms).`,
    );

    const textContent = (listPagesResult.content ?? [])
      .filter((entry): entry is {type: string; text: string} => {
        return Boolean(entry && entry.type === 'text' && entry.text);
      })
      .map(entry => entry.text)
      .join('\n');
    if (!textContent) {
      throw new Error('list_pages returned no textual content to inspect.');
    }

    const jsonStart = textContent.indexOf('[');
    const jsonEnd = textContent.lastIndexOf(']');
    assert(
      jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart,
      'Unable to locate pages JSON payload in list_pages response.',
    );
    const pagesJson = textContent.slice(jsonStart, jsonEnd + 1);
    const pages = JSON.parse(pagesJson) as Array<{
      index: number;
      url: string;
      title?: string;
      selected?: boolean;
    }>;
    assert(Array.isArray(pages), 'list_pages payload is not an array.');
    const forbidden = pages.filter(page => {
      const lower = page.url.toLowerCase();
      return (
        lower.startsWith('chrome-extension://') ||
        lower.startsWith('devtools://') ||
        lower.includes('snaps/index.html') ||
        lower.includes('offscreen.html')
      );
    });
    assert(
      forbidden.length === 0,
      `list_pages included filtered URLs: ${forbidden.map(p => p.url).join(', ')}`,
    );

    await wait(250); // allow log stream to flush
    const logContent = await fs.readFile(logFile, 'utf-8');
    for (const line of REQUIRED_LOG_LINES) {
      assert(
        logContent.includes(line),
        `Missing expected log line: "${line}"`,
      );
    }
    assert(
      /bootstrap: (first page attached|timed out, continuing)/.test(
        logContent,
      ),
      'Missing bootstrap completion log (first page attached or timed out).',
    );

    console.log(
      JSON.stringify(
        {
          browserUrl,
          bootstrapTimeoutMs,
          firstToolDurationMs: firstToolDuration,
          listPagesDurationMs: listPagesDuration,
          pagesCount: pages.length,
          logFile,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

async function assertBrowserReachable(browserUrl: string): Promise<void> {
  const versionUrl = new URL('/json/version', browserUrl).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 3_000);
  try {
    const response = await fetch(versionUrl, {signal: controller.signal});
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    await response.json();
  } catch (error) {
    throw new Error(
      `Unable to reach Chromium debugger at ${versionUrl}. ` +
        `Ensure Chrome is running with --remote-debugging-port. Original error: ${
          (error as Error).message
        }`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

main().catch(error => {
  console.error('Remote bootstrap test failed:', error);
  process.exitCode = 1;
});
