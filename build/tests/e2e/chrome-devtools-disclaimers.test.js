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
    it('forwards disclaimers to stderr on start', async () => {
        const result = await runCli(['start'], sessionId);
        assert.strictEqual(result.status, 0, `start command failed: ${result.stderr}`);
        assert(result.stderr.includes('chrome-devtools-mcp exposes content'), 'Disclaimer not found in stderr on start');
    });
});
//# sourceMappingURL=chrome-devtools-disclaimers.test.js.map