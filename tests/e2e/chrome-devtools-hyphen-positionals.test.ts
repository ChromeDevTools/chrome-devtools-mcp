/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {describe, it, after, before} from 'node:test';

import {assertDaemonIsNotRunning, runCli} from '../utils.js';

describe('chrome-devtools positional values starting with a hyphen', () => {
  let sessionId: string;
  let textareaUid: string;

  // Start one daemon for the whole suite. Starting a daemon and Chrome per
  // test makes the file exceed the test timeout on slow machines.
  before(async () => {
    sessionId = crypto.randomUUID();
    await runCli(['stop'], sessionId);
    await assertDaemonIsNotRunning(sessionId);

    const startResult = await runCli(['start'], sessionId);
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    const navigateResult = await runCli(
      [
        'navigate_page',
        '1',
        '--url',
        'data:text/html,<textarea id="t">x</textarea>',
      ],
      sessionId,
    );
    assert.strictEqual(
      navigateResult.status,
      0,
      `navigate_page command failed: ${navigateResult.stderr}`,
    );

    const snapshotResult = await runCli(['take_snapshot', '1'], sessionId);
    assert.strictEqual(
      snapshotResult.status,
      0,
      `take_snapshot command failed: ${snapshotResult.stderr}`,
    );
    const uidMatch = snapshotResult.stdout.match(/uid=(\S+) textbox/);
    assert.ok(
      uidMatch,
      'textarea uid not found in snapshot: ' + snapshotResult.stdout,
    );
    textareaUid = uidMatch[1];
  });

  after(async () => {
    await runCli(['stop'], sessionId);
    await assertDaemonIsNotRunning(sessionId);
  });

  async function readTextareaValue(): Promise<string> {
    const result = await runCli(
      [
        'evaluate_script',
        '() => document.getElementById("t").value',
        '--pageId',
        '1',
      ],
      sessionId,
    );
    assert.strictEqual(
      result.status,
      0,
      `evaluate_script command failed: ${result.stderr}`,
    );
    const match = result.stdout.match(/"(.*)"/);
    assert.ok(match, 'unexpected evaluate_script output: ' + result.stdout);
    return JSON.parse(`"${match[1]}"`);
  }

  const fillCases: Array<{value: string[]; expected: string}> = [
    {value: ['-'], expected: '-'},
    {value: ['-5'], expected: '-5'},
    {value: ['a-b'], expected: 'a-b'},
    {value: ['--weird'], expected: '--weird'},
    {value: ['- item'], expected: '- item'},
    {value: ['-abc'], expected: '-abc'},
    {value: ['--', '--weird'], expected: '--weird'},
  ];
  for (const {value, expected} of fillCases) {
    it(`fill passes ${JSON.stringify(value.join(' '))} through`, async () => {
      const args = ['fill', '1', textareaUid, ...value];
      const result = await runCli(args, sessionId);
      assert.strictEqual(
        result.status,
        0,
        `${args.join(' ')} failed: ${result.stderr}`,
      );
      assert.strictEqual(await readTextareaValue(), expected);
    });
  }

  it('type_text passes a lone hyphen through', async () => {
    const result = await runCli(['type_text', '1', '-'], sessionId);
    assert.strictEqual(
      result.status,
      0,
      `type_text command failed: ${result.stderr}`,
    );
    assert.match(result.stdout, /Typed text "-"/);
  });

  it('press_key passes a lone hyphen through', async () => {
    const result = await runCli(['press_key', '1', '-'], sessionId);
    assert.strictEqual(
      result.status,
      0,
      `press_key command failed: ${result.stderr}`,
    );
    assert.match(result.stdout, /Successfully pressed key: -/);
  });

  it('rejects unknown flags that are not preceded by --', async () => {
    const result = await runCli(
      ['fill', '1', 'x', 'x', '--pageid', '2'],
      sessionId,
    );
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Unknown arguments?: .*pageid/);
  });
});
