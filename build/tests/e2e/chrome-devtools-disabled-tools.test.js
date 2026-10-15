/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, it, afterEach, beforeEach } from 'node:test';
import { assertDaemonIsNotRunning, runCli } from '../utils.js';
describe('chrome-devtools', () => {
    let sessionId;
    beforeEach(async () => {
        sessionId = crypto.randomUUID();
        await runCli(['stop'], sessionId);
        await assertDaemonIsNotRunning(sessionId);
    });
    afterEach(async () => {
        await runCli(['stop'], sessionId);
        await assertDaemonIsNotRunning(sessionId);
    });
    it('fails to invoke list_network_requests when categoryNetwork is disabled', async () => {
        await runCli(['start', '--categoryNetwork=false'], sessionId);
        const result = await runCli(['list_network_requests', '1'], sessionId);
        assert.strictEqual(result.status, 0);
        assert(result.stdout.includes('Tool list_network_requests is in category Network which is currently disabled'), 'error message is unexpected: ' + result.stdout);
        assert(result.stdout.includes('chrome-devtools start --categoryNetwork=true'), 'restart command suggestion is missing: ' + result.stdout);
    });
    it('fails to invoke click_at when experimentalVision is disabled (default)', async () => {
        await runCli(['start'], sessionId);
        const result = await runCli(['click_at', '1', '100', '100'], sessionId);
        assert.strictEqual(result.status, 0);
        assert(result.stdout.includes('Tool click_at requires experimental feature --experimentalVision and is currently disabled'), 'error message is unexpected: ' + result.stdout);
        assert(result.stdout.includes('chrome-devtools start --experimentalVision=true'), 'restart command suggestion is miss: ' + result.stdout);
    });
    it('fails to invoke evaluate_script when javascriptEvaluation is disabled', async () => {
        await runCli(['start', '--no-javascript-evaluation'], sessionId);
        const result = await runCli(['evaluate_script', '() => 1'], sessionId);
        assert.strictEqual(result.status, 0);
        assert(result.stdout.includes('Tool evaluate_script requires flag --javascriptEvaluation and is currently disabled'), 'error message is unexpected: ' + result.stdout);
        assert(result.stdout.includes('chrome-devtools start --javascriptEvaluation=true'), 'restart command suggestion is missing: ' + result.stdout);
        const navResult = await runCli(['navigate_page', '1', '--url', 'javascript:alert(1)'], sessionId);
        assert.strictEqual(navResult.status, 0);
        assert(navResult.stdout.includes('Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled.'), 'error message is unexpected: ' + navResult.stdout);
        const initScriptResult = await runCli([
            'navigate_page',
            '1',
            '--initScript',
            'alert(1)',
            '--timeout',
            'invalid',
        ], sessionId);
        assert.strictEqual(initScriptResult.status, 0);
        assert(initScriptResult.stdout.includes('Input validation error: Invalid arguments for tool navigate_page: timeout: Invalid input: expected number, received null, Unrecognized key: "initScript"'), 'error message is unexpected: ' + initScriptResult.stdout);
    });
});
//# sourceMappingURL=chrome-devtools-disabled-tools.test.js.map