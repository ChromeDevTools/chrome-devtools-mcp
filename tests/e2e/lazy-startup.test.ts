/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

import {createTempDir} from '../utils.js';

const SERVER_ENTRY = path.resolve(
  import.meta.dirname,
  '../../src/bin/chrome-devtools-mcp.js',
);
const LIGHT_BUNDLE_PATH = fs.realpathSync(
  path.resolve(import.meta.dirname, '../../src/third_party/index.js'),
);
const BROWSER_BUNDLE_PATH = fs.realpathSync(
  path.resolve(import.meta.dirname, '../../src/third_party/browser.js'),
);

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
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    return;
  }
  const killDeadline = Date.now() + 1_000;
  while (Date.now() < killDeadline && isProcessAlive(pid)) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

function readLoadedFilePaths(logPath: string): Set<string> {
  let content: string;
  try {
    content = fs.readFileSync(logPath, 'utf8');
  } catch {
    return new Set();
  }
  const loaded = new Set<string>();
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('file://')) {
      continue;
    }
    const filePath = fileURLToPath(line);
    try {
      loaded.add(fs.realpathSync(filePath));
    } catch {
      loaded.add(path.normalize(filePath));
    }
  }
  return loaded;
}

describe('lazy browser bundle startup', () => {
  it('loads third_party/browser.js only when the first tool call runs', async () => {
    using tempDir = createTempDir('cd4a.lazy-startup-');
    const hooksPath = path.join(tempDir.path, 'hooks.mjs');
    const registerPath = path.join(tempDir.path, 'register.mjs');
    const logPath = path.join(tempDir.path, 'loaded-modules.log');

    fs.writeFileSync(
      hooksPath,
      [
        "import fs from 'node:fs';",
        'const logPath = process.env.MCP_MODULE_LOAD_LOG;',
        'export async function load(url, context, nextLoad) {',
        '  if (logPath) {',
        '    fs.appendFileSync(logPath, `${url}\\n`);',
        '  }',
        '  return await nextLoad(url, context);',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      registerPath,
      [
        "import {register} from 'node:module';",
        `register(${JSON.stringify(pathToFileURL(hooksPath).href)});`,
      ].join('\n'),
    );

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    env.CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS = 'true';
    env.CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS = 'true';
    env.CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY = 'true';
    env.MCP_MODULE_LOAD_LOG = logPath;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        '--import',
        pathToFileURL(registerPath).href,
        SERVER_ENTRY,
        '--usage-statistics=false',
        '--browserUrl=http://127.0.0.1:1',
      ],
      env,
      stderr: 'pipe',
    });
    const client = new Client(
      {name: 'lazy-startup-test', version: '1.0.0'},
      {capabilities: {}},
    );

    let serverPid: number | null = null;
    try {
      await client.connect(transport);
      serverPid = transport.pid;
      assert.ok(serverPid !== null, 'MCP server did not start');
      await client.listTools(undefined, {timeout: 15_000});

      const idleLoaded = readLoadedFilePaths(logPath);
      assert.strictEqual(
        idleLoaded.has(LIGHT_BUNDLE_PATH),
        true,
        'Expected third_party/index.js to be recorded by the loader hook',
      );
      assert.strictEqual(
        idleLoaded.has(BROWSER_BUNDLE_PATH),
        false,
        'Expected third_party/browser.js not to load during startup or tools/list',
      );

      const result = await client.callTool(
        {
          name: 'list_pages',
          arguments: {},
        },
        {timeout: 15_000},
      );
      assert.strictEqual(result.isError, true);

      const afterToolLoaded = readLoadedFilePaths(logPath);
      assert.strictEqual(
        afterToolLoaded.has(BROWSER_BUNDLE_PATH),
        true,
        'Expected third_party/browser.js to load on the first tool call',
      );
    } finally {
      await client.close();
      if (serverPid !== null) {
        await waitForProcessExit(serverPid);
      }
    }
  });
});
