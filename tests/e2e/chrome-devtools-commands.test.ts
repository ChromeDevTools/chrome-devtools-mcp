/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';
import {pathToFileURL} from 'node:url';

import {
  assertDaemonIsNotRunning,
  assertDaemonIsRunning,
  createTempDir,
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

    const result = await runCli(['take_screenshot', '1'], sessionId);
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

  it('can evaluate inline and local JavaScript', async () => {
    using rootDirectory = createTempDir('evaluate-script-cli-');
    const daemonDirectory = path.join(rootDirectory.path, 'daemon');
    const clientDirectory = path.join(rootDirectory.path, 'client');
    await fs.mkdir(daemonDirectory);
    await fs.mkdir(clientDirectory);

    const sourcePath = path.join(clientDirectory, 'script.js');
    const outputPath = path.join(clientDirectory, 'result.json');
    try {
      const startResult = await runCli(['start'], sessionId, {
        cwd: daemonDirectory,
      });
      assert.strictEqual(
        startResult.status,
        0,
        `start command failed: ${startResult.stderr}`,
      );

      const inlineResult = await runCli(
        ['evaluate_script', '() => 6 * 7', '--pageId', '1'],
        sessionId,
        {cwd: clientDirectory},
      );
      assert.strictEqual(
        inlineResult.status,
        0,
        `inline evaluation failed: ${inlineResult.stderr}`,
      );
      assert.match(inlineResult.stdout, /\b42\b/);

      await fs.writeFile(
        sourcePath,
        'document.title = "Local script"; document.title',
        'utf8',
      );
      const fileResult = await runCli(
        [
          'evaluate_script',
          '--pageId',
          '1',
          '--sourcePath',
          sourcePath,
          '--format',
          'script',
          '--filePath',
          outputPath,
        ],
        sessionId,
        {cwd: clientDirectory},
      );
      assert.strictEqual(
        fileResult.status,
        0,
        `file evaluation failed: ${fileResult.stderr}`,
      );
      assert.strictEqual(
        JSON.parse(await fs.readFile(outputPath, 'utf8')),
        'Local script',
      );

      const fileUrlResult = await runCli(
        [
          'evaluate_script',
          '--pageId',
          '1',
          '--sourcePath',
          pathToFileURL(sourcePath).href,
          '--format',
          'script',
        ],
        sessionId,
        {cwd: clientDirectory},
      );
      assert.strictEqual(
        fileUrlResult.status,
        0,
        `file URL evaluation failed: ${fileUrlResult.stderr}`,
      );
      assert.match(fileUrlResult.stdout, /Local script/);
    } finally {
      await runCli(['stop'], sessionId, {cwd: clientDirectory});
    }
  });

  describe('positional values starting with a hyphen', () => {
    async function startDaemon(): Promise<void> {
      const startResult = await runCli(['start'], sessionId);
      assert.strictEqual(
        startResult.status,
        0,
        `start command failed: ${startResult.stderr}`,
      );
    }

    /** Starts the daemon, opens a page with a textarea and returns its uid. */
    async function startWithTextarea(): Promise<string> {
      await startDaemon();

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
      return uidMatch[1];
    }

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
        const uid = await startWithTextarea();

        const args = ['fill', '1', uid, ...value];
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
      await startDaemon();

      const result = await runCli(['type_text', '1', '-'], sessionId);
      assert.strictEqual(
        result.status,
        0,
        `type_text command failed: ${result.stderr}`,
      );
      assert.match(result.stdout, /Typed text "-"/);
    });

    it('press_key passes a lone hyphen through', async () => {
      await startDaemon();

      const result = await runCli(['press_key', '1', '-'], sessionId);
      assert.strictEqual(
        result.status,
        0,
        `press_key command failed: ${result.stderr}`,
      );
      assert.match(result.stdout, /Successfully pressed key: -/);
    });

    it('rejects unknown flags that are not preceded by --', async () => {
      await startDaemon();

      const result = await runCli(
        ['fill', '1', 'x', 'x', '--pageid', '2'],
        sessionId,
      );
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /Unknown arguments?: .*pageid/);
    });
  });

  it('fails to invoke list_network_requests when categoryNetwork is disabled', async () => {
    await runCli(['start', '--categoryNetwork=false'], sessionId);

    const result = await runCli(['list_network_requests', '1'], sessionId);
    assert.strictEqual(result.status, 0);

    assert(
      result.stdout.includes(
        'Tool list_network_requests is in category Network which is currently disabled',
      ),
      'error message is unexpected: ' + result.stdout,
    );
    assert(
      result.stdout.includes('chrome-devtools start --categoryNetwork=true'),
      'restart command suggestion is missing: ' + result.stdout,
    );
  });

  it('fails to invoke click_at when experimentalVision is disabled (default)', async () => {
    await runCli(['start'], sessionId);

    const result = await runCli(['click_at', '1', '100', '100'], sessionId);
    assert.strictEqual(result.status, 0);
    assert(
      result.stdout.includes(
        'Tool click_at requires experimental feature --experimentalVision and is currently disabled',
      ),
      'error message is unexpected: ' + result.stdout,
    );
    assert(
      result.stdout.includes('chrome-devtools start --experimentalVision=true'),
      'restart command suggestion is miss: ' + result.stdout,
    );
  });

  it('fails to invoke evaluate_script when javascriptEvaluation is disabled', async () => {
    await runCli(['start', '--no-javascript-evaluation'], sessionId);

    const result = await runCli(['evaluate_script', '() => 1'], sessionId);
    assert.strictEqual(result.status, 0);
    assert(
      result.stdout.includes(
        'Tool evaluate_script requires flag --javascriptEvaluation and is currently disabled',
      ),
      'error message is unexpected: ' + result.stdout,
    );
    assert(
      result.stdout.includes(
        'chrome-devtools start --javascriptEvaluation=true',
      ),
      'restart command suggestion is missing: ' + result.stdout,
    );

    const navResult = await runCli(
      ['navigate_page', '1', '--url', 'javascript:alert(1)'],
      sessionId,
    );
    assert.strictEqual(navResult.status, 0);
    assert(
      navResult.stdout.includes(
        'Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled.',
      ),
      'error message is unexpected: ' + navResult.stdout,
    );

    const initScriptResult = await runCli(
      [
        'navigate_page',
        '1',
        '--initScript',
        'alert(1)',
        '--timeout',
        'invalid',
      ],
      sessionId,
    );
    assert.strictEqual(initScriptResult.status, 0);
    assert(
      initScriptResult.stdout.includes(
        'Input validation error: Invalid arguments for tool navigate_page: timeout: Invalid input: expected number, received null, Unrecognized key: "initScript"',
      ),
      'error message is unexpected: ' + initScriptResult.stdout,
    );
  });

  it('can record a performance trace', async () => {
    const startResult = await runCli(
      ['start', '--performanceCrux=false'],
      sessionId,
    );
    assert.strictEqual(
      startResult.status,
      0,
      `start command failed: ${startResult.stderr}`,
    );

    const emulateResult = await runCli(
      ['emulate', '1', '--cpuThrottlingRate', '2'],
      sessionId,
    );
    assert.strictEqual(
      emulateResult.status,
      0,
      `emulate command failed: ${emulateResult.stderr}`,
    );

    const result = await runCli(['performance_start_trace', '1'], sessionId);
    assert.strictEqual(
      result.status,
      0,
      `performance_start_trace command failed: ${result.stderr}`,
    );
    assert(
      result.stdout.includes('The performance trace has been stopped.'),
      'performance_start_trace output is unexpected: ' + result.stdout,
    );
    assert(
      result.stdout.includes('CPU throttling: 2x'),
      'performance_start_trace output is unexpected: ' + result.stdout,
    );
  });
});
