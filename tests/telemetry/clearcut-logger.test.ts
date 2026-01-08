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
import {Persistence, FilePersistence} from '../../src/telemetry/persistence.js';

describe('ClearcutLogger', () => {
  let mockPersistence: sinon.SinonStubbedInstance<Persistence>;
  let fetchMock: sinon.SinonStub;

  beforeEach(() => {
    mockPersistence = sinon.createStubInstance(FilePersistence, {
      loadState: Promise.resolve({
        lastActive: '',
        firstTimeSent: false,
      }),
    });
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
      const logger = new ClearcutLogger({persistence: mockPersistence});
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
      assert.strictEqual(body.log_source, 2839);
      assert.strictEqual(body.client_info.client_type, 47);
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
    it('logs flag usage and checks daily active', async () => {
      const logger = new ClearcutLogger({persistence: mockPersistence});
      // Spy on the logger's logDailyActiveIfNeeded to make sure it's called
      const logDailySpy = sinon.spy(logger, 'logDailyActiveIfNeeded');

      await logger.logServerStart({headless: true});

      assert(logDailySpy.calledOnce);
      
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

  describe('logServerShutdown', () => {
    it('sends correct payload', async () => {
      const logger = new ClearcutLogger({persistence: mockPersistence});
      await logger.logServerShutdown();

      assert(fetchMock.calledOnce);
      const [, options] = fetchMock.firstCall.args;
      const body = JSON.parse(options.body);
      const extension = JSON.parse(body.log_event[0].source_extension_json);

      assert.ok(extension.server_shutdown);
      // Verify session_id is present
      assert.match(
        extension.session_id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('Session Rotation', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('rotates session id after 24 hours', async () => {
      const logger = new ClearcutLogger({persistence: mockPersistence});

      // Trigger first log to capture session ID
      await logger.logToolInvocation({
        toolName: 'test',
        success: true,
        latencyMs: 1,
      });
      const firstCallBody = JSON.parse(fetchMock.lastCall.args[1].body);
      const firstSessionId = JSON.parse(
        firstCallBody.log_event[0].source_extension_json,
      ).session_id;

      // Advance time by 25 hours
      clock.tick(25 * 60 * 60 * 1000);

      // Trigger second log
      await logger.logToolInvocation({
        toolName: 'test',
        success: true,
        latencyMs: 1,
      });
      const secondCallBody = JSON.parse(fetchMock.lastCall.args[1].body);
      const secondSessionId = JSON.parse(
        secondCallBody.log_event[0].source_extension_json,
      ).session_id;

      assert.notStrictEqual(firstSessionId, secondSessionId);
    });
  });

  describe('logDailyActiveIfNeeded', () => {
    it('logs first time installation if not sent', async () => {
      mockPersistence.loadState.resolves({lastActive: '', firstTimeSent: false});
      const logger = new ClearcutLogger({persistence: mockPersistence});
      
      await logger.logDailyActiveIfNeeded();

      const calls = fetchMock.getCalls();
      const firstTimeCall = calls.find(call => {
        const body = JSON.parse(call.args[1].body);
        const extension = JSON.parse(body.log_event[0].source_extension_json);
        return !!extension.first_time_installation;
      });

      assert(firstTimeCall, 'Should have logged first time installation');
      assert(mockPersistence.saveState.called);
    });

    it('logs daily active if needed (lastActive > 24h ago)', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      mockPersistence.loadState.resolves({
        lastActive: yesterday.toISOString(),
        firstTimeSent: true,
      });
      
      const logger = new ClearcutLogger({persistence: mockPersistence});
      await logger.logDailyActiveIfNeeded();

      const calls = fetchMock.getCalls();
      const dailyActiveCall = calls.find(call => {
        const body = JSON.parse(call.args[1].body);
        const extension = JSON.parse(body.log_event[0].source_extension_json);
        return !!extension.daily_active;
      });

      assert(dailyActiveCall, 'Should have logged daily active');
      assert(mockPersistence.saveState.called);
    });

    it('does not log if not needed (today)', async () => {
      mockPersistence.loadState.resolves({
        lastActive: new Date().toISOString(),
        firstTimeSent: true,
      });

      const logger = new ClearcutLogger({persistence: mockPersistence});
      await logger.logDailyActiveIfNeeded();

      assert(fetchMock.notCalled);
      assert(mockPersistence.saveState.notCalled);
    });
  });
});
