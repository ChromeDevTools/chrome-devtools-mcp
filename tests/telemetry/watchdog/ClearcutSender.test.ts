/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {OsType} from '../../../src/telemetry/types.js';
import type {LogRequest} from '../../../src/telemetry/types.js';
import {ClearcutSender} from '../../../src/telemetry/watchdog/ClearcutSender.js';

const FLUSH_INTERVAL_MS = 15 * 1000;

describe('ClearcutSender', () => {
  let randomUUIDStub: sinon.SinonStub;
  let fetchStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers({
      now: Date.now(),
      toFake: ['setTimeout', 'clearTimeout', 'Date'],
    });

    let uuidCounter = 0;
    randomUUIDStub = sinon.stub(crypto, 'randomUUID').callsFake(() => {
      return `uuid-${++uuidCounter}` as ReturnType<typeof crypto.randomUUID>;
    });
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({}), {status: 200}));
  });

  afterEach(() => {
    randomUUIDStub.restore();
    fetchStub.restore();
    clock.restore();
    sinon.restore();
  });

  it('enriches events with app version, os type, and session id', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    sender.enqueueEvent({mcp_client: undefined});
    assert.strictEqual(sender.bufferSizeForTesting, 1);

    await clock.tickAsync(FLUSH_INTERVAL_MS);
    sender.stopForTesting();

    assert.strictEqual(fetchStub.callCount, 1);
    const requestBody = JSON.parse(
      fetchStub.firstCall.args[1].body,
    ) as LogRequest;
    const event = JSON.parse(requestBody.log_event[0].source_extension_json);

    assert.strictEqual(event.session_id, 'uuid-1');
    assert.strictEqual(event.app_version, '1.0.0');
    assert.strictEqual(event.os_type, OsType.OS_TYPE_MACOS);
  });

  it('accumulates events in buffer without immediate send', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    sender.enqueueEvent({
      tool_invocation: {tool_name: 'test1', success: true, latency_ms: 100},
    });
    sender.enqueueEvent({
      tool_invocation: {tool_name: 'test2', success: true, latency_ms: 200},
    });

    assert.strictEqual(sender.bufferSizeForTesting, 2);
    assert.strictEqual(fetchStub.callCount, 0);

    sender.stopForTesting();
  });

  it('sends correct LogRequest format', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    sender.enqueueEvent({
      tool_invocation: {tool_name: 'test', success: true, latency_ms: 100},
    });

    await clock.tickAsync(FLUSH_INTERVAL_MS);
    sender.stopForTesting();

    const [url, options] = fetchStub.firstCall.args;
    assert.strictEqual(
      url,
      'https://play.googleapis.com/log?format=json_proto',
    );
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.headers['Content-Type'], 'application/json');

    const body = JSON.parse(options.body) as LogRequest;
    assert.strictEqual(body.log_source, 2839);
    assert.strictEqual(body.client_info.client_type, 47);
    assert.ok(body.request_time_ms);
  });

  it('clears buffer on successful send', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    sender.enqueueEvent({});
    sender.enqueueEvent({});
    assert.strictEqual(sender.bufferSizeForTesting, 2);

    await clock.tickAsync(FLUSH_INTERVAL_MS);
    sender.stopForTesting();
    assert.strictEqual(sender.bufferSizeForTesting, 0);
  });

  it('keeps events in buffer on transient 5xx error', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });
    fetchStub.resolves(new Response('Server Error', {status: 500}));

    sender.enqueueEvent({});
    await clock.tickAsync(FLUSH_INTERVAL_MS);
    sender.stopForTesting();

    assert.strictEqual(sender.bufferSizeForTesting, 1);
  });

  it('keeps events in buffer on transient 429 error', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });
    fetchStub.resolves(new Response('Too Many Requests', {status: 429}));

    sender.enqueueEvent({});
    await clock.tickAsync(FLUSH_INTERVAL_MS);
    sender.stopForTesting();

    assert.strictEqual(sender.bufferSizeForTesting, 1);
  });

  it('drops batch on permanent 4xx error', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });
    fetchStub.resolves(new Response('Bad Request', {status: 400}));

    sender.enqueueEvent({});
    await clock.tickAsync(FLUSH_INTERVAL_MS);
    sender.stopForTesting();

    assert.strictEqual(sender.bufferSizeForTesting, 0);
  });

  it('keeps events in buffer on network error', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });
    fetchStub.rejects(new Error('Network error'));

    sender.enqueueEvent({});
    await clock.tickAsync(FLUSH_INTERVAL_MS);
    sender.stopForTesting();

    assert.strictEqual(sender.bufferSizeForTesting, 1);
  });

  it('sendShutdownEvent sends an immediate server_shutdown event', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    await sender.sendShutdownEvent();

    assert.strictEqual(fetchStub.callCount, 1);
    const requestBody = JSON.parse(
      fetchStub.firstCall.args[1].body,
    ) as LogRequest;
    const event = JSON.parse(requestBody.log_event[0].source_extension_json);

    assert.ok(event.server_shutdown);
  });

  it('shutdown includes buffered events', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    sender.enqueueEvent({
      tool_invocation: {tool_name: 'test', success: true, latency_ms: 100},
    });
    await sender.sendShutdownEvent();

    const requestBody = JSON.parse(
      fetchStub.firstCall.args[1].body,
    ) as LogRequest;
    assert.strictEqual(requestBody.log_event.length, 2);
  });

  it('correctly handles buffer overflow during queued flush', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    sender.enqueueEvent({
      tool_invocation: {tool_name: 'initial', success: true, latency_ms: 100},
    });
    let resolveRequest: (value: Response) => void;

    fetchStub.onFirstCall().returns(
      new Promise<Response>(resolve => {
        resolveRequest = resolve;
      }),
    );

    clock.tick(FLUSH_INTERVAL_MS);

    for (let i = 0; i < 1100; i++) {
      sender.enqueueEvent({
        tool_invocation: {
          tool_name: `overflow-${i}`,
          success: true,
          latency_ms: 100,
        },
      });
    }

    assert.strictEqual(sender.bufferSizeForTesting, 1000);

    resolveRequest!(new Response(JSON.stringify({}), {status: 200}));

    assert.strictEqual(sender.bufferSizeForTesting, 1000);

    sender.stopForTesting();
  });

  it('does not duplicate events when shutdown occurs during an active flush', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });
    sender.enqueueEvent({
      tool_invocation: {
        tool_name: 'test-event',
        success: true,
        latency_ms: 100,
      },
    });

    let resolveFirstRequest: (value: Response) => void;
    fetchStub.onFirstCall().returns(
      new Promise<Response>(resolve => {
        resolveFirstRequest = resolve;
      }),
    );

    clock.tick(FLUSH_INTERVAL_MS);

    const shutdownPromise = sender.sendShutdownEvent();

    resolveFirstRequest!(new Response(JSON.stringify({}), {status: 200}));
    await shutdownPromise;

    assert.strictEqual(fetchStub.callCount, 2);
    const firstBody = JSON.parse(fetchStub.args[0][1].body) as LogRequest;
    const secondBody = JSON.parse(fetchStub.args[1][1].body) as LogRequest;

    const firstEvents = firstBody.log_event.map(e =>
      JSON.parse(e.source_extension_json),
    );
    const secondEvents = secondBody.log_event.map(e =>
      JSON.parse(e.source_extension_json),
    );

    assert.strictEqual(firstEvents.length, 1);
    assert.strictEqual(firstEvents[0].tool_invocation?.tool_name, 'test-event');

    assert.strictEqual(
      secondEvents.length,
      1,
      'Shutdown request should only contain shutdown event',
    );
    assert.ok(
      secondEvents[0].server_shutdown,
      'Shutdown request should contain server_shutdown',
    );

    sender.stopForTesting();
  });

  it('rotates session id after 24 hours', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    sender.enqueueEvent({
      tool_invocation: {tool_name: 'test1', success: true, latency_ms: 10},
    });
    await clock.tickAsync(FLUSH_INTERVAL_MS);

    const firstCallBody = JSON.parse(
      fetchStub.firstCall.args[1].body,
    ) as LogRequest;
    const firstEvent = JSON.parse(
      firstCallBody.log_event[0].source_extension_json,
    );
    const firstSessionId = firstEvent.session_id;

    const SESSION_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
    await clock.tickAsync(
      SESSION_ROTATION_INTERVAL_MS - FLUSH_INTERVAL_MS + 1000,
    );

    sender.enqueueEvent({
      tool_invocation: {tool_name: 'test2', success: true, latency_ms: 10},
    });
    await clock.tickAsync(FLUSH_INTERVAL_MS);

    const secondCallBody = JSON.parse(
      fetchStub.secondCall.args[1].body,
    ) as LogRequest;
    const secondEvent = JSON.parse(
      secondCallBody.log_event[0].source_extension_json,
    );
    const secondSessionId = secondEvent.session_id;

    assert.notStrictEqual(firstSessionId, secondSessionId);

    sender.stopForTesting();
  });

  it('respects next_request_wait_millis from server', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });

    fetchStub.resolves(
      new Response(
        JSON.stringify({
          next_request_wait_millis: 45000,
        }),
        {status: 200},
      ),
    );

    sender.enqueueEvent({});
    await clock.tickAsync(FLUSH_INTERVAL_MS);

    fetchStub.resetHistory();

    sender.enqueueEvent({});

    await clock.tickAsync(44000);
    assert.strictEqual(
      fetchStub.callCount,
      0,
      'Should not flush before wait time',
    );

    await clock.tickAsync(1000);
    assert.strictEqual(fetchStub.callCount, 1, 'Should flush after wait time');

    sender.stopForTesting();
  });

  it('aborts request after timeout', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });
    const REQUEST_TIMEOUT_MS = 30000;

    let fetchSignal: AbortSignal | undefined;
    fetchStub.callsFake((_url, options) => {
      fetchSignal = options.signal;
      return new Promise(() => {
        // Hangs forever
      });
    });

    sender.enqueueEvent({});

    await clock.tickAsync(FLUSH_INTERVAL_MS);
    await clock.tickAsync(REQUEST_TIMEOUT_MS);

    assert.ok(fetchSignal, 'Fetch should have been called with a signal');
    assert.strictEqual(
      fetchSignal.aborted,
      true,
      'Signal should be aborted after timeout',
    );

    sender.stopForTesting();
  });

  it('resolves sendShutdownEvent after timeout if flush hangs', async () => {
    const sender = new ClearcutSender({
      appVersion: '1.0.0',
      osType: OsType.OS_TYPE_MACOS,
      forceFlushIntervalMs: FLUSH_INTERVAL_MS,
    });
    fetchStub.returns(
      new Promise(() => {
        // Hangs forever
      }),
    );

    const shutdownPromise = sender.sendShutdownEvent();

    await clock.tickAsync(5000);

    await shutdownPromise;
  });
});
