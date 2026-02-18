/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {ClearcutLogger} from '../../src/telemetry/ClearcutLogger.js';
import type {Persistence} from '../../src/telemetry/persistence.js';
import {FilePersistence} from '../../src/telemetry/persistence.js';
import {WatchdogMessageType} from '../../src/telemetry/types.js';
import {WatchdogClient} from '../../src/telemetry/WatchdogClient.js';

describe('ClearcutLogger', () => {
  let mockPersistence: sinon.SinonStubbedInstance<Persistence>;
  let mockWatchdogClient: sinon.SinonStubbedInstance<WatchdogClient>;

  beforeEach(() => {
    mockPersistence = sinon.createStubInstance(FilePersistence, {
      loadState: Promise.resolve({
        lastActive: '',
      }),
    });
    mockWatchdogClient = sinon.createStubInstance(WatchdogClient);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('logToolInvocation', () => {
    it('sends correct payload', async () => {
      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        appVersion: '1.0.0',
        watchdogClient: mockWatchdogClient,
      });
      await logger.logToolInvocation({
        toolName: 'test_tool',
        success: true,
        latencyMs: 123,
      });

      assert(mockWatchdogClient.send.calledOnce);
      const msg = mockWatchdogClient.send.firstCall.args[0];
      assert.strictEqual(msg.type, WatchdogMessageType.LOG_EVENT);
      assert.strictEqual(msg.payload.tool_invocation?.tool_name, 'test_tool');
      assert.strictEqual(msg.payload.tool_invocation?.success, true);
      assert.strictEqual(msg.payload.tool_invocation?.latency_ms, 123);
    });
  });

  describe('logServerStart', () => {
    it('logs flag usage', async () => {
      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        appVersion: '1.0.0',
        watchdogClient: mockWatchdogClient,
      });

      await logger.logServerStart({headless: true});

      assert(mockWatchdogClient.send.calledOnce);
      const msg = mockWatchdogClient.send.firstCall.args[0];
      assert.strictEqual(msg.type, WatchdogMessageType.LOG_EVENT);
      assert.strictEqual(msg.payload.server_start?.flag_usage?.headless, true);
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
        appVersion: '1.0.0',
        watchdogClient: mockWatchdogClient,
      });

      await logger.logDailyActiveIfNeeded();

      assert(mockWatchdogClient.send.calledOnce);
      const msg = mockWatchdogClient.send.firstCall.args[0];
      assert.strictEqual(msg.type, WatchdogMessageType.LOG_EVENT);
      assert.ok(msg.payload.daily_active);

      assert(mockPersistence.saveState.called);
    });

    it('does not log daily active if not needed (today)', async () => {
      mockPersistence.loadState.resolves({
        lastActive: new Date().toISOString(),
      });

      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        appVersion: '1.0.0',
        watchdogClient: mockWatchdogClient,
      });

      await logger.logDailyActiveIfNeeded();

      assert(mockWatchdogClient.send.notCalled);
      assert(mockPersistence.saveState.notCalled);
    });

    it('logs daily active with -1 if lastActive is missing', async () => {
      mockPersistence.loadState.resolves({
        lastActive: '',
      });

      const logger = new ClearcutLogger({
        persistence: mockPersistence,
        appVersion: '1.0.0',
        watchdogClient: mockWatchdogClient,
      });

      await logger.logDailyActiveIfNeeded();

      assert(mockWatchdogClient.send.calledOnce);
      const msg = mockWatchdogClient.send.firstCall.args[0];
      assert.strictEqual(msg.type, WatchdogMessageType.LOG_EVENT);
      assert.strictEqual(msg.payload.daily_active?.days_since_last_active, -1);
      assert(mockPersistence.saveState.called);
    });
  });
});
