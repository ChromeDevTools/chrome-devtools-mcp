/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {SlimMcpResponse} from '../src/SlimMcpResponse.js';
import {createMockMcpContext, createMockServerConfig} from './mocks.js';

describe('SlimMcpResponse', () => {
  it('preserves response lines when there is no error', async () => {
    const response = new SlimMcpResponse(createMockServerConfig());
    response.appendResponseLine('Navigation complete');

    const {content} = await response.handle(createMockMcpContext());

    assert.strictEqual(content[0].type, 'text');
    assert.strictEqual(content[0].text, 'Navigation complete');
  });

  it('includes stored errors in the response text', async () => {
    const response = new SlimMcpResponse(createMockServerConfig());
    response.appendResponseLine('Navigation started');
    response.setError(new Error('Navigation failed'));

    const {content} = await response.handle(createMockMcpContext());

    assert.strictEqual(content[0].type, 'text');
    assert.strictEqual(
      content[0].text,
      'Navigation started\nError: Navigation failed',
    );
  });
});
