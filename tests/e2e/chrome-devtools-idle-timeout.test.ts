/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {describe, it} from 'node:test';

import {sendCommand} from '../../src/daemon/client.js';
import {getPidFilePath, isDaemonRunning} from '../../src/daemon/utils.js';
import {createCliSession, startCli} from '../utils.js';

const EXIT_DEADLINE_MS = 20_000;

/**
 * Polls `status` until the daemon removes its PID file. The polling also
 * checks that `status` requests do not keep the daemon alive.
 */
async function waitForIdleExit(sessionId: string): Promise<void> {
  const pidFilePath = getPidFilePath(sessionId);
  const deadline = Date.now() + EXIT_DEADLINE_MS;
  while (fs.existsSync(pidFilePath) && Date.now() < deadline) {
    try {
      await sendCommand({method: 'status'}, sessionId, 1_000);
    } catch {
      // The daemon may be shutting down.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(
    !fs.existsSync(pidFilePath),
    `daemon did not remove ${pidFilePath} within ${EXIT_DEADLINE_MS} ms`,
  );
  assert.ok(!isDaemonRunning(sessionId), 'daemon is still running');
}

async function startWithIdleTimeout(
  sessionId: string,
  idleTimeout: string,
): Promise<void> {
  const startResult = await startCli(sessionId, [
    `--idleTimeout=${idleTimeout}`,
  ]);
  assert.strictEqual(
    startResult.status,
    0,
    `start command failed: ${startResult.stderr}`,
  );
}

// Each test uses its own daemon session, so the tests run in parallel.
describe('chrome-devtools --idleTimeout', {concurrency: true}, () => {
  it('exits when no tool call arrives while status is polled', async t => {
    const sessionId = createCliSession(t);
    await startWithIdleTimeout(sessionId, '2s');

    await waitForIdleExit(sessionId);
  });

  it('finishes a tool call that outlasts both timeouts, then exits', async t => {
    const sessionId = createCliSession(t);
    await startWithIdleTimeout(sessionId, '2s');

    const response = await sendCommand(
      {
        method: 'invoke_tool',
        tool: 'evaluate_script',
        args: {
          function:
            '() => new Promise(resolve => setTimeout(() => resolve("done"), 8000))',
          pageId: 1,
        },
      },
      sessionId,
    );
    assert.ok(
      response.success,
      `tool call failed: ${JSON.stringify(response)}`,
    );
    assert.ok(response.result.includes('done'), response.result);

    await waitForIdleExit(sessionId);
  });
});
