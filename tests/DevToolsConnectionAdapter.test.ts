/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';
import sinon from 'sinon';

import {DevToolsConnectionAdapter} from '../src/DevToolsConnectionAdapter.js';
import {type ConnectionTransport} from '../src/third_party/index.js';

class MockTransport implements ConnectionTransport {
  onmessage: ((message: string) => void) | undefined;
  onclose: (() => void) | undefined;

  send(message: string): void {}
  close(): void {}
}

describe('DevToolsConnectionAdapter', () => {
  it('should pass messages from transport to onMessage', () => {
    const transport = new MockTransport();
    const adapter = new DevToolsConnectionAdapter(transport);
    const onMessage = sinon.spy();

    adapter.setOnMessage(onMessage);
    transport.onmessage?.('test message');

    assert.ok(onMessage.calledOnceWith('test message'));
  });

  it('should call onDisconnect when transport closes', () => {
    const transport = new MockTransport();
    const adapter = new DevToolsConnectionAdapter(transport);
    const onDisconnect = sinon.spy();

    adapter.setOnDisconnect(onDisconnect);
    transport.onclose?.();

    assert.ok(onDisconnect.calledOnce);
  });

  it('should send messages through the transport', () => {
    const transport = new MockTransport();
    const spy = sinon.spy(transport, 'send');
    const adapter = new DevToolsConnectionAdapter(transport);

    adapter.sendRawMessage('test message');

    assert.ok(spy.calledOnceWith('test message'));
  });

  it('should close the transport on disconnect', async () => {
    const transport = new MockTransport();
    const spy = sinon.spy(transport, 'close');
    const adapter = new DevToolsConnectionAdapter(transport);

    await adapter.disconnect();

    assert.ok(spy.calledOnce);
  });
});
