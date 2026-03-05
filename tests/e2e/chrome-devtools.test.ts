/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

const CLI_PATH = path.resolve('build/src/bin/chrome-devtools.js');

describe('chrome-devtools', () => {
  const START_ARGS = ['--headless', '--isolated'];

  function assertDaemonIsNotRunning() {
    const result = spawnSync('node', [CLI_PATH, 'status']);
    assert.strictEqual(
      result.stdout.toString(),
      'chrome-devtools-mcp daemon is not running.\n',
    );
  }

  function assertDaemonIsRunning() {
    const result = spawnSync('node', [CLI_PATH, 'status']);
    assert.ok(
      result.stdout
        .toString()
        .startsWith('chrome-devtools-mcp daemon is running.\n'),
      'chrome-devtools-mcp daemon is not running',
    );
  }

  beforeEach(() => {
    spawnSync('node', [CLI_PATH, 'stop']);
    assertDaemonIsNotRunning();
  });

  afterEach(() => {
    spawnSync('node', [CLI_PATH, 'stop']);
    assertDaemonIsNotRunning();
  });

  it('reports daemon status correctly', () => {
    assertDaemonIsNotRunning();

    const startResult = spawnSync('node', [CLI_PATH, 'start', ...START_ARGS]);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr.toString()}`,
    );

    assertDaemonIsRunning();
  });

  it('can start and stop the daemon', () => {
    assertDaemonIsNotRunning();

    const startResult = spawnSync('node', [CLI_PATH, 'start', ...START_ARGS]);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr.toString()}`,
    );

    assertDaemonIsRunning();

    const stopResult = spawnSync('node', [CLI_PATH, 'stop']);
    assert.strictEqual(
      stopResult.status,
      0,
      `stop command failed: ${stopResult.stderr.toString()}`,
    );

    assertDaemonIsNotRunning();
  });

  it('can invoke list_pages', async () => {
    assertDaemonIsNotRunning();

    const startResult = spawnSync('node', [CLI_PATH, 'start', ...START_ARGS]);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr.toString()}`,
    );

    const listPagesResult = spawnSync('node', [CLI_PATH, 'list_pages']);
    assert.strictEqual(
      listPagesResult.status,
      0,
      `list_pages command failed: ${listPagesResult.stderr.toString()}`,
    );
    assert(
      listPagesResult.stdout.toString().includes('about:blank'),
      'list_pages output is unexpected',
    );

    assertDaemonIsRunning();
  });

  it('can take screenshot', async () => {
    const startResult = spawnSync('node', [CLI_PATH, 'start', ...START_ARGS]);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr.toString()}`,
    );

    const result = spawnSync('node', [CLI_PATH, 'take_screenshot']);
    assert.strictEqual(
      result.status,
      0,
      `take_screenshot command failed: ${result.stderr.toString()}`,
    );
    assert(
      result.stdout.toString().includes('.png'),
      'take_screenshot output is unexpected',
    );
  });

  it('forwards disclaimers to stderr on start', () => {
    const result = spawnSync('node', [CLI_PATH, 'start', ...START_ARGS]);
    assert.strictEqual(
      result.status,
      0,
      `start command failed: ${result.stderr.toString()}`,
    );
    assert(
      result.stderr.toString().includes('chrome-devtools-mcp exposes content'),
      'Disclaimer not found in stderr on start',
    );
  });
});
