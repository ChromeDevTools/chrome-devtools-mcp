/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

const CLI_PATH = path.resolve('build/src/bin/chrome-devtools.js');

async function runCli(
  args: string[],
): Promise<{status: number | null; stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on('close', status => resolve({status, stdout, stderr}));
    child.on('error', reject);
  });
}

describe('chrome-devtools', () => {
  async function assertDaemonIsNotRunning() {
    const result = await runCli(['status']);
    assert.strictEqual(
      result.stdout,
      'chrome-devtools-mcp daemon is not running.\n',
    );
  }

  async function assertDaemonIsRunning() {
    const result = await runCli(['status']);
    assert.ok(
      result.stdout.startsWith('chrome-devtools-mcp daemon is running.\n'),
      'chrome-devtools-mcp daemon is not running',
    );
  }

  beforeEach(async () => {
    await runCli(['stop']);
    await assertDaemonIsNotRunning();
  });

  afterEach(async () => {
    await runCli(['stop']);
    await assertDaemonIsNotRunning();
  });

  it('reports daemon status correctly', async () => {
    await assertDaemonIsNotRunning();

    const startResult = await runCli(['start']);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    await assertDaemonIsRunning();
  });

  it('can start and stop the daemon', async () => {
    await assertDaemonIsNotRunning();

    const startResult = await runCli(['start']);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    await assertDaemonIsRunning();

    const stopResult = await runCli(['stop']);
    assert.strictEqual(
      stopResult.status,
      0,
      `stop command failed: ${stopResult.stderr}`,
    );

    await assertDaemonIsNotRunning();
  });

  it('can invoke list_pages', async () => {
    await assertDaemonIsNotRunning();

    const startResult = await runCli(['start']);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    const listPagesResult = await runCli(['list_pages']);
    assert.strictEqual(
      listPagesResult.status,
      0,
      `list_pages command failed: ${listPagesResult.stderr}`,
    );
    assert(
      listPagesResult.stdout.includes('about:blank'),
      'list_pages output is unexpected',
    );

    await assertDaemonIsRunning();
  });

  it('can take screenshot', async () => {
    const startResult = await runCli(['start']);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    const result = await runCli(['take_screenshot']);
    assert.strictEqual(
      result.status,
      0,
      `take_screenshot command failed: ${result.stderr}`,
    );
    assert(
      result.stdout.includes('.png'),
      'take_screenshot output is unexpected',
    );
  });

  it('forwards disclaimers to stderr on start', async () => {
    const result = await runCli(['start']);
    assert.strictEqual(
      result.status,
      0,
      `start command failed: ${result.stderr}`,
    );
    assert(
      result.stderr.includes('chrome-devtools-mcp exposes content'),
      'Disclaimer not found in stderr on start',
    );
  });
});
