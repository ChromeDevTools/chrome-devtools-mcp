/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, mock} from 'node:test';
import {ClearcutLogger} from '../../src/telemetry/clearcut-logger.js';
import {ClearcutSender} from '../../src/telemetry/clearcut-sender.js';

describe('ClearcutLogger', () => {
  it('should log tool invocation via sender', async () => {
    const sender = new ClearcutSender();
    const sendSpy = mock.method(sender, 'send');
    const loggerInstance = new ClearcutLogger(sender);

    await loggerInstance.logToolInvocation({
      toolName: 'test-tool',
      success: true,
      latencyMs: 100,
    });

    assert.strictEqual(sendSpy.mock.callCount(), 1);
    const event = sendSpy.mock.calls[0].arguments[0];
    assert.deepStrictEqual(event.tool_invocation, {
      tool_name: 'test-tool',
      success: true,
      latency_ms: 100,
    });
  });

  it('should log server start via sender', async () => {
    const sender = new ClearcutSender();
    const sendSpy = mock.method(sender, 'send');
    const loggerInstance = new ClearcutLogger(sender);

    await loggerInstance.logServerStart({headless: true});

    assert.strictEqual(sendSpy.mock.callCount(), 1);
    const event = sendSpy.mock.calls[0].arguments[0];
    assert.deepStrictEqual(event.server_start, {
      flag_usage: {headless: true},
    });
  });
});
