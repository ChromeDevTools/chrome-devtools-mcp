/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {assertDaemonIsNotRunning, runCli} from '../utils.js';

describe('chrome-devtools', () => {
  beforeEach(async () => {
    await runCli(['stop']);
    await assertDaemonIsNotRunning();
  });

  afterEach(async () => {
    await runCli(['stop']);
    await assertDaemonIsNotRunning();
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
