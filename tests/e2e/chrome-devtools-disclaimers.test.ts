/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {assertDaemonIsNotRunning, runCli} from '../utils.js';

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

  it('forwards disclaimers to stderr on start', async () => {
    const result = await runCli(['start'], sessionId);
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
