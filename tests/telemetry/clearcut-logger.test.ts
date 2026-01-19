/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {ClearcutLogger} from '../../src/telemetry/clearcut-logger.js';
import {ClearcutSender} from '../../src/telemetry/clearcut-sender.js';
import type {Persistence} from '../../src/telemetry/persistence.js';
import {FilePersistence} from '../../src/telemetry/persistence.js';

describe('ClearcutLogger', () => {
  let mockPersistence: sinon.SinonStubbedInstance<Persistence>;
  let mockSender: sinon.SinonStubbedInstance<ClearcutSender>;

  beforeEach(() => {
    mockPersistence = sinon.createStubInstance(FilePersistence, {
      loadState: Promise.resolve({
        lastActive: '',
      }),
    });
    mockSender = sinon.createStubInstance(ClearcutSender);
    mockSender.send.resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('logToolInvocation', () => {
    it('sends correct payload', async () => {
      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        sender: mockSender,
      });
      await logger.logToolInvocation({
        toolName: 'test_tool',
        success: true,
        latencyMs: 123,
      });

      assert(mockSender.send.calledOnce);
      const extension = mockSender.send.firstCall.args[0];
      assert.strictEqual(extension.tool_invocation?.tool_name, 'test_tool');
      assert.strictEqual(extension.tool_invocation?.success, true);
      assert.strictEqual(extension.tool_invocation?.latency_ms, 123);
    });
  });

  describe('logServerStart', () => {
    it('logs flag usage', async () => {
      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        sender: mockSender,
      });

      await logger.logServerStart({headless: true});

      // Should have logged server start
      const calls = mockSender.send.getCalls();
      const serverStartCall = calls.find(call => {
        return !!call.args[0].server_start;
      });

      assert(serverStartCall);
      assert.strictEqual(
        serverStartCall.args[0].server_start?.flag_usage?.headless,
        true,
      );
    });
  });

  describe('logDailyActiveIfNeeded', () => {
    it('logs daily active if needed (lastActive > 24h ago)', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPersistence.loadState.resolves({
        lastActive: yesterday.toISOString(),
      });

      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        sender: mockSender,
      });

      await logger.logDailyActiveIfNeeded();

      const calls = mockSender.send.getCalls();
      const dailyActiveCall = calls.find(call => {
        return !!call.args[0].daily_active;
      });

      assert(dailyActiveCall, 'Should have logged daily active');
      assert(mockPersistence.saveState.called);
    });

    it('does not log daily active if not needed (today)', async () => {
      mockPersistence.loadState.resolves({
        lastActive: new Date().toISOString(),
      });

      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        sender: mockSender,
      });

      await logger.logDailyActiveIfNeeded();

      const calls = mockSender.send.getCalls();
      const dailyActiveCall = calls.find(call => {
        return !!call.args[0].daily_active;
      });

      assert(!dailyActiveCall, 'Should NOT have logged daily active');
      assert(mockPersistence.saveState.notCalled);
    });

    it('logs daily active with -1 if lastActive is missing', async () => {
      mockPersistence.loadState.resolves({
        lastActive: '',
      });

      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        sender: mockSender,
      });

      await logger.logDailyActiveIfNeeded();

      const calls = mockSender.send.getCalls();
      const dailyActiveCall = calls.find(call => {
        return !!call.args[0].daily_active;
      });

      assert(dailyActiveCall, 'Should have logged daily active');
      assert.strictEqual(
        dailyActiveCall.args[0].daily_active?.days_since_last_active,
        -1,
      );
      assert(mockPersistence.saveState.called);
    });
  });
});
