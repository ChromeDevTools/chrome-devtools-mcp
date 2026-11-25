/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
import path from 'node:path';
import {describe, it} from 'node:test';

const WATCHDOG_PATH = path.resolve(
  import.meta.dirname,
  '../../../src/telemetry/watchdog/main.js',
);

const REQUIRED_ARGS = {
  'parent-pid': '1',
  'app-version': '1.0.0',
  'os-type': '1',
  'session-id': 'session-1',
  'clearcut-endpoint': 'http://127.0.0.1:1',
};

function runWatchdogWithout(
  missing: keyof typeof REQUIRED_ARGS,
): SpawnSyncReturns<string> {
  const args = Object.entries(REQUIRED_ARGS)
    .filter(([name]) => name !== missing)
    .map(([name, value]) => `--${name}=${value}`);
  return spawnSync(process.execPath, [WATCHDOG_PATH, ...args], {
    encoding: 'utf8',
    input: '',
    timeout: 10_000,
  });
}

describe('watchdog main', () => {
  it('exits with an error when --session-id is missing', () => {
    const result = runWatchdogWithout('session-id');

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Invalid arguments provided for watchdog/);
  });

  it('exits with an error when --clearcut-endpoint is missing', () => {
    const result = runWatchdogWithout('clearcut-endpoint');

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Invalid arguments provided for watchdog/);
  });
});
