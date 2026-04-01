/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {
  assertDaemonIsNotRunning,
  assertDaemonIsRunning,
  runCli,
} from '../utils.js';

describe('chrome-devtools', () => {
  beforeEach(async () => {
    await runCli(['stop']);
    await assertDaemonIsNotRunning();
  });

  afterEach(async () => {
    await runCli(['stop']);
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
});
