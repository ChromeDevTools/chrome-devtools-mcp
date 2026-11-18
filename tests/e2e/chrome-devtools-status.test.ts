/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {
  CONFIG_FILE_NAME,
  NO_CONFIG_DISCOVERY_ENV,
} from '../../src/config/ConfigLocator.js';
import {
  assertDaemonIsNotRunning,
  assertDaemonIsRunning,
  createTempDir,
  runCli,
  stopDaemonForCleanup,
} from '../utils.js';

describe('chrome-devtools', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = crypto.randomUUID();
  });

  afterEach(async () => {
    await stopDaemonForCleanup(sessionId);
  });

  it('reports daemon status correctly', async () => {
    await assertDaemonIsNotRunning(sessionId);

    const startResult = await runCli(['start'], sessionId);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    await assertDaemonIsRunning(sessionId);
  });

  it('does not forward emulate viewport tool arg to daemon startup flags on auto-start', async () => {
    await assertDaemonIsNotRunning(sessionId);

    using configDir = createTempDir('chrome-devtools-status-config-');
    let cliOptions: {env: NodeJS.ProcessEnv} | undefined;
    const chromePath = process.env['PUPPETEER_EXECUTABLE_PATH'];
    if (chromePath) {
      fs.writeFileSync(
        path.join(configDir.path, CONFIG_FILE_NAME),
        JSON.stringify({executablePath: chromePath}),
      );
      cliOptions = {
        env: {
          PLUGIN_DATA: configDir.path,
          [NO_CONFIG_DISCOVERY_ENV]: undefined,
        },
      };
    }

    const emulateResult = await runCli(
      ['emulate', '1', '--viewport', '500x400x1'],
      sessionId,
      cliOptions,
    );
    assert.strictEqual(
      emulateResult.status,
      0,
      `emulate command failed: ${emulateResult.stderr}`,
    );
    assert.match(
      emulateResult.stdout,
      /Emulation configured successfully/,
      `emulate did not launch browser: ${emulateResult.stdout}`,
    );

    const statusResult = await runCli(['status'], sessionId);
    assert.strictEqual(
      statusResult.status,
      0,
      `status command failed: ${statusResult.stderr}`,
    );
    assert.match(statusResult.stdout, /args=\["--viaCli"\]/);
  });
});
