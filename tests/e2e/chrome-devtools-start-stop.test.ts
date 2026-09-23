/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {
  assertDaemonIsNotRunning,
  assertDaemonIsRunning,
  createTempDir,
  runCli,
} from '../utils.js';

describe('chrome-devtools', () => {
  let sessionId: string;

  beforeEach(async () => {
    sessionId = crypto.randomUUID();
    await runCli(['stop'], sessionId);
    await assertDaemonIsNotRunning(sessionId);
  });

  afterEach(async () => {
    await runCli(['stop'], sessionId);
    await assertDaemonIsNotRunning(sessionId);
  });

  it('can start and stop the daemon', async () => {
    await assertDaemonIsNotRunning(sessionId);

    const startResult = await runCli(['start'], sessionId);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    await assertDaemonIsRunning(sessionId);

    const stopResult = await runCli(['stop'], sessionId);
    assert.strictEqual(
      stopResult.status,
      0,
      `stop command failed: ${stopResult.stderr}`,
    );

    await assertDaemonIsNotRunning(sessionId);
  });

  it('can start the daemon with userDataDir', async () => {
    using userDataDir = createTempDir('chrome-devtools-test-');

    const startResult = await runCli(
      ['start', '--userDataDir', userDataDir.path],
      sessionId,
    );
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );
    assert.ok(
      !startResult.stderr.includes(
        'Arguments userDataDir and isolated are mutually exclusive',
      ),
      `unexpected conflict error: ${startResult.stderr}`,
    );

    await assertDaemonIsRunning(sessionId);
  });

  it('forwards an explicit headless=false option', async () => {
    const startResult = await runCli(['start', '--headless=false'], sessionId);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    const statusResult = await runCli(['status'], sessionId);
    assert.strictEqual(statusResult.status, 0);
    assert.ok(
      statusResult.stdout.includes('--no-headless'),
      `headless=false was not forwarded: ${statusResult.stdout}`,
    );
  });

  it('can start the daemon with a workspace', async () => {
    using workspace = createTempDir('chrome-devtools-workspace-');

    const startResult = await runCli(
      ['start', '--workspace', workspace.path],
      sessionId,
    );
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    const statusResult = await runCli(['status'], sessionId);
    assert.strictEqual(statusResult.status, 0);
    assert.ok(
      statusResult.stdout.includes('--filesystem-root=') &&
        statusResult.stdout.includes(path.basename(workspace.path)),
      `workspace was not forwarded: ${statusResult.stdout}`,
    );
  });

  it('can start the daemon with a config file', async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'chrome-devtools-config-profile-'),
    );
    const configPath = path.join(
      os.tmpdir(),
      `chrome-devtools-config-${crypto.randomUUID()}.json`,
    );
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        userDataDir,
        headless: true,
      }),
    );

    try {
      const relativeConfigPath = path.relative(process.cwd(), configPath);
      const startResult = await runCli(
        ['start', '--config', relativeConfigPath],
        sessionId,
      );
      assert.strictEqual(
        startResult.status,
        0,
        `start command failed: ${startResult.stderr}`,
      );

      const statusResult = await runCli(['status'], sessionId);
      assert.strictEqual(statusResult.status, 0);
      assert.ok(
        statusResult.stdout.includes(JSON.stringify(`--config=${configPath}`)),
        `resolved config path was not forwarded: ${statusResult.stdout}`,
      );
      assert.ok(
        !statusResult.stdout.includes('--headless'),
        `default --headless should not be forwarded when not specified on CLI: ${statusResult.stdout}`,
      );
      assert.ok(
        !statusResult.stdout.includes('--filesystem-root'),
        `default --filesystem-root should not be forwarded when not specified on CLI: ${statusResult.stdout}`,
      );

      const overrideResult = await runCli(
        ['start', '--config', relativeConfigPath, '--headless'],
        sessionId,
      );
      assert.strictEqual(
        overrideResult.status,
        0,
        `start command with --headless override failed: ${overrideResult.stderr}`,
      );

      const overrideStatusResult = await runCli(['status'], sessionId);
      assert.strictEqual(overrideStatusResult.status, 0);
      assert.ok(
        overrideStatusResult.stdout.includes('"--headless"'),
        `explicit --headless CLI flag was not forwarded: ${overrideStatusResult.stdout}`,
      );
    } finally {
      fs.rmSync(configPath, {force: true});
      fs.rmSync(userDataDir, {recursive: true, force: true});
    }
  });
});
