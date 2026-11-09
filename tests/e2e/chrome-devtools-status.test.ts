/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {
  assertDaemonIsNotRunning,
  assertDaemonIsRunning,
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

    const emulateResult = await runCli(
      ['emulate', '1', '--viewport', '500x400x1'],
      sessionId,
    );
    assert.strictEqual(
      emulateResult.status,
      0,
      `emulate command failed: ${emulateResult.stderr}`,
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
