/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it, afterEach, beforeEach, mock} from 'node:test';

import assert from 'assert';
import sinon from 'sinon';

import {
  ClearcutLogger,
  CLEARCUT_ENDPOINT,
} from '../../src/telemetry/clearcut-logger.js';

describe('ClearcutLogger', () => {
  let fetchMock: sinon.SinonStub;

  beforeEach(() => {
    fetchMock = sinon.stub(global, 'fetch').resolves({
      ok: true,
      text: () => Promise.resolve('OK'),
    } as Response);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('logToolInvocation', () => {
    it('sends correct payload', async () => {
      const logger = new ClearcutLogger();
      await logger.logToolInvocation({
        toolName: 'test_tool',
        success: true,
        latencyMs: 123,
      });

      assert(fetchMock.calledOnce);
      const [url, options] = fetchMock.firstCall.args;
      assert.strictEqual(url, CLEARCUT_ENDPOINT);
      assert.strictEqual(options.method, 'POST');

      const body = JSON.parse(options.body);
      assert.strictEqual(body.log_source_name, 'CHROME_DEVTOOLS_MCP');
      assert.strictEqual(body.client_info.client_type, 'CHROME_DEVTOOLS_MCP_JS');
      assert.strictEqual(body.log_event.length, 1);

      const extension = JSON.parse(body.log_event[0].source_extension_json);
      assert.strictEqual(extension.tool_invocation.tool_name, 'test_tool');
      assert.strictEqual(extension.tool_invocation.success, true);
      assert.strictEqual(extension.tool_invocation.latency_ms, 123);
      assert.match(
        extension.session_id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('logServerStart', () => {
    it('logs flag usage', async () => {
      const logger = new ClearcutLogger();

      await logger.logServerStart({headless: true});
      
      // Should have logged server start
      const calls = fetchMock.getCalls();
      const serverStartCall = calls.find(call => {
        const body = JSON.parse(call.args[1].body);
        const extension = JSON.parse(body.log_event[0].source_extension_json);
        return !!extension.server_start;
      });

      assert(serverStartCall);
      const body = JSON.parse(serverStartCall.args[1].body);
      const extension = JSON.parse(body.log_event[0].source_extension_json);
      assert.strictEqual(extension.server_start.flag_usage.headless, true);
    });
  });
});
