/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {describe, it} from 'node:test';

import {assertDaemonIsRunning, createCliSession, runCli} from '../utils.js';

function envWithSessionId(sessionId: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CHROME_DEVTOOLS_SESSION_ID: sessionId,
  };
  delete env.CD4A_INTERNAL_DAEMON_SESSION_ID;
  return env;
}

describe('chrome-devtools --sessionId', {concurrency: true}, () => {
  it('lists --sessionId in --help', async () => {
    const result = await runCli(['--help']);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /--sessionId/);
    assert.match(result.stdout, /\$CHROME_DEVTOOLS_SESSION_ID/);
  });

  it('rejects an invalid --sessionId', async () => {
    const result = await runCli(['status'], 'not_a_session_id');

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Invalid sessionId: not_a_session_id/);
  });

  it('rejects an invalid CHROME_DEVTOOLS_SESSION_ID', async () => {
    const result = await runCli(['status'], undefined, {
      env: envWithSessionId('not_a_session_id'),
    });

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Invalid sessionId: not_a_session_id/);
  });

  it('uses CHROME_DEVTOOLS_SESSION_ID unless --sessionId is passed', async t => {
    const sessionId = createCliSession(t);
    const env = envWithSessionId(sessionId);

    const startResult = await runCli(['start'], undefined, {env});
    assert.strictEqual(startResult.status, 0, startResult.stderr);

    await assertDaemonIsRunning(sessionId);
    const otherSession = await runCli(['status'], crypto.randomUUID(), {env});
    assert.strictEqual(
      otherSession.stdout,
      'chrome-devtools-mcp daemon is not running.\n',
    );
  });
});
