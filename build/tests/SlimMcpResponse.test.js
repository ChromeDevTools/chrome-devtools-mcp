/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import sinon from 'sinon';
import { SlimMcpResponse } from '../src/SlimMcpResponse.js';
import { createMockMcpContext, createMockParsedArguments } from './mocks.js';
describe('SlimMcpResponse', () => {
    afterEach(() => {
        sinon.restore();
    });
    it('preserves response lines when there is no error', async () => {
        const response = new SlimMcpResponse(createMockParsedArguments());
        response.appendResponseLine('Navigation complete');
        const { content } = await response.handle(createMockMcpContext());
        assert.strictEqual(content[0].type, 'text');
        assert.strictEqual(content[0].text, 'Navigation complete');
    });
    it('includes stored errors in the response text', async () => {
        const response = new SlimMcpResponse(createMockParsedArguments());
        response.appendResponseLine('Navigation started');
        response.setError(new Error('Navigation failed'));
        const { content } = await response.handle(createMockMcpContext());
        assert.strictEqual(content[0].type, 'text');
        assert.strictEqual(content[0].text, 'Navigation started\nError: Navigation failed');
    });
});
//# sourceMappingURL=SlimMcpResponse.test.js.map