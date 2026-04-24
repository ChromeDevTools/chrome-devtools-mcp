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

  it('can invoke list_pages', async () => {
    await assertDaemonIsNotRunning(sessionId);

    const startResult = await runCli(['start'], sessionId);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    const listPagesResult = await runCli(['list_pages'], sessionId);
    assert.strictEqual(
      listPagesResult.status,
      0,
      `list_pages command failed: ${listPagesResult.stderr}`,
    );
    assert(
      listPagesResult.stdout.includes('about:blank'),
      'list_pages output is unexpected',
    );

    await assertDaemonIsRunning(sessionId);
  });

  it('can take screenshot', async () => {
    const startResult = await runCli(['start'], sessionId);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    const result = await runCli(['take_screenshot'], sessionId);
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
});
