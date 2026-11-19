/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {sendCommand} from '../../src/daemon/client.js';
import {
  assertDaemonIsNotRunning,
  assertDaemonIsRunning,
  createCliSession,
  createTempDir,
  createTempFile,
  runCli,
} from '../utils.js';

// Each test uses its own daemon session, so the tests run in parallel.
describe('chrome-devtools', {concurrency: true}, () => {
  it('can start and stop the daemon', async t => {
    const sessionId = createCliSession(t);
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

  it('asks to run a tool call again when stop interrupts it', async t => {
    const sessionId = createCliSession(t);
    const startResult = await runCli(['start'], sessionId);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );
    const listPages = await sendCommand(
      {method: 'invoke_tool', tool: 'list_pages', args: {}},
      sessionId,
    );
    assert.ok(listPages.success, JSON.stringify(listPages));

    const longCall = sendCommand(
      {
        method: 'invoke_tool',
        tool: 'evaluate_script',
        args: {
          function: '() => new Promise(resolve => setTimeout(resolve, 10000))',
          pageId: 1,
        },
      },
      sessionId,
    );
    await sendCommand({method: 'stop'}, sessionId);

    assert.deepStrictEqual(await longCall, {
      success: false,
      error:
        'The chrome-devtools daemon is shutting down. Run the command again to start a new daemon.',
    });
  });

  it('can start the daemon with userDataDir', async t => {
    const sessionId = createCliSession(t);
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

  it('forwards an explicit headless=false option', async t => {
    const sessionId = createCliSession(t);
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

  it('can start the daemon with a workspace', async t => {
    const sessionId = createCliSession(t);
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

  it('can start the daemon with a config file', async t => {
    const sessionId = createCliSession(t);
    using userDataDir = createTempDir('chrome-devtools-config-profile-');
    using configFile = createTempFile(
      JSON.stringify({
        userDataDir: userDataDir.path,
        headless: true,
      }),
      'chrome-devtools-config.json',
    );

    const relativeConfigPath = path.relative(process.cwd(), configFile.path);
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
      statusResult.stdout.includes(
        JSON.stringify(`--config=${configFile.path}`),
      ),
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
  });
});
