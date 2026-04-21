/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {
  assertDaemonIsNotRunning,
  assertDaemonIsRunning,
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
    const userDataDir = path.join(
      os.tmpdir(),
      `chrome-devtools-test-${crypto.randomUUID()}`,
    );
    fs.mkdirSync(userDataDir, {recursive: true});

    const startResult = await runCli(
      ['start', '--userDataDir', userDataDir],
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
});
