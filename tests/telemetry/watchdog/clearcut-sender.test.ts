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
import {ClearcutSender} from '../../../src/telemetry/watchdog/clearcut-sender.js';

describe('ClearcutSender', () => {
  let clock: sinon.SinonFakeTimers;
  let randomUUIDStub: sinon.SinonStub;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    let uuidCounter = 0;
    randomUUIDStub = sinon.stub(crypto, 'randomUUID').callsFake(() => {
      return `uuid-${++uuidCounter}` as ReturnType<typeof crypto.randomUUID>;
    });
  });

  afterEach(() => {
    clock.restore();
    randomUUIDStub.restore();
    sinon.restore();
  });

  it('enriches events with app version, os type, and session id', async () => {
    const sender = new ClearcutSender('1.0.0', OsType.OS_TYPE_MACOS);
    const transportStub = sinon.stub(sender, 'transport');

    await sender.send({mcp_client: undefined});

    assert.strictEqual(transportStub.callCount, 1);
    const event = transportStub.firstCall.args[0];

    assert.strictEqual(event.session_id, 'uuid-1');
    assert.strictEqual(event.app_version, '1.0.0');
    assert.strictEqual(event.os_type, OsType.OS_TYPE_MACOS);
  });

  it('rotates session ID after 24 hours', async () => {
    const sender = new ClearcutSender('1.0.0', OsType.OS_TYPE_MACOS);
    const transportStub = sinon.stub(sender, 'transport');

    await sender.send({});
    assert.strictEqual(transportStub.lastCall.args[0].session_id, 'uuid-1');

    clock.tick(23 * 60 * 60 * 1000);
    await sender.send({});
    assert.strictEqual(transportStub.lastCall.args[0].session_id, 'uuid-1');

    clock.tick(2 * 60 * 60 * 1000);
    await sender.send({});
    assert.strictEqual(transportStub.lastCall.args[0].session_id, 'uuid-2');
  });

  it('sendShutdownEvent sends a server_shutdown event', async () => {
    const sender = new ClearcutSender('1.0.0', OsType.OS_TYPE_MACOS);
    const transportStub = sinon.stub(sender, 'transport');

    await sender.sendShutdownEvent();

    const event = transportStub.firstCall.args[0];
    assert.ok(event.server_shutdown);
    assert.strictEqual(event.server_start, undefined);
  });
});
