/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, it, afterEach, beforeEach } from 'node:test';
import { runCli, stopDaemonForCleanup } from '../utils.js';
describe('chrome-devtools', () => {
    let sessionId;
    beforeEach(() => {
        sessionId = crypto.randomUUID();
    });
    afterEach(async () => {
        await stopDaemonForCleanup(sessionId);
    });
    it('can record a performance trace', async () => {
        const startResult = await runCli(['start', '--performanceCrux=false'], sessionId);
        assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);
        const emulateResult = await runCli(['emulate', '1', '--cpuThrottlingRate', '2'], sessionId);
        assert.strictEqual(emulateResult.status, 0, `emulate command failed: ${emulateResult.stderr}`);
        const result = await runCli(['performance_start_trace', '1'], sessionId);
        assert.strictEqual(result.status, 0, `performance_start_trace command failed: ${result.stderr}`);
        assert(result.stdout.includes('The performance trace has been stopped.'), 'performance_start_trace output is unexpected: ' + result.stdout);
        assert(result.stdout.includes('CPU throttling: 2x'), 'performance_start_trace output is unexpected: ' + result.stdout);
    });
});
//# sourceMappingURL=chrome-devtools-performance.test.js.map