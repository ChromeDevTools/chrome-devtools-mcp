/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFile} from 'node:fs/promises';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {executablePath} from 'puppeteer';

export async function connectComparisonClient(
  extraArgs: string[] = [],
): Promise<{client: Client; transport: StdioClientTransport}> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'build/src/bin/chrome-devtools-mcp.js',
      '--headless',
      '--isolated',
      '--executable-path',
      executablePath(),
      '--no-usage-statistics',
      '--no-performance-crux',
      '--chrome-arg=--no-sandbox',
      '--chrome-arg=--disable-setuid-sandbox',
      ...extraArgs,
    ],
  });
  const client = new Client(
    {name: 'e2e-comparison', version: '1.0.0'},
    {capabilities: {}},
  );
  await client.connect(transport);
  return {client, transport};
}

export function extractJson(text: string): unknown {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) {
    throw new Error('No JSON block in tool response');
  }
  return JSON.parse(match[1]);
}

export function toolText(res: unknown): string {
  const r = res as {content?: Array<{text?: string}>};
  return (r.content?.[0]?.text as string) ?? '';
}

export function findUid(snapshotText: string, needle: string): string {
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (!line.includes('uid=') || !line.includes(needle)) {
      continue;
    }
    if (line.includes('RootWebArea')) {
      continue;
    }
    const m = line.match(/uid=(\d+_\d+)/);
    if (m) {
      return m[1];
    }
  }
  throw new Error('UID not found for: ' + needle);
}

const dataUrlCache = new Map<string, string>();

export async function htmlFileAsDataUrl(absolutePath: string): Promise<string> {
  const cached = dataUrlCache.get(absolutePath);
  if (cached) {
    return cached;
  }
  const raw = await readFile(absolutePath, 'utf8');
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(raw)}`;
  dataUrlCache.set(absolutePath, url);
  return url;
}

export async function withClient(
  cb: (client: Client) => Promise<void>,
  extraArgs: string[] = [],
): Promise<void> {
  const {client} = await connectComparisonClient(extraArgs);
  try {
    await cb(client);
  } finally {
    await client.close();
  }
}
