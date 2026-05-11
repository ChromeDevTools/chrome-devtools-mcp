/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import {CdpCDPSession} from 'puppeteer-core/internal/cdp/CdpSession.js';
import sinon from 'sinon';

import {InternalConnection as Connection} from '../src/third_party/index.js';

describe('puppeteer-patches', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('restores missing sessionId in responses', async () => {
    const mockTransport: {
      send(msg: string): void;
      onmessage?: (msg: string) => void;
      onclose?: () => void;
      close(): void;
    } = {
      send() {
        /* No-op */
      },
      close() {
        /* No-op */
      },
    };
    const transportSendSpy = sinon.spy(mockTransport, 'send');
    const connection = new Connection('http://localhost', mockTransport);
    const sessionId = 'test-session-id';
    const session = new CdpCDPSession(
      connection,
      'page',
      sessionId,
      undefined,
      false,
    );
    const onMessageSpy = sinon.spy(session, 'onMessage');
    connection._sessions.set(sessionId, session);

    // Trigger send through session to establish mapping
    const sendPromise = session.send('Browser.getVersion');

    // Get the ID from the sent message
    sinon.assert.calledOnce(transportSendSpy);
    const sentMessage = transportSendSpy.getCall(0).args[0];
    const messageId = JSON.parse(sentMessage).id;

    // Simulate message without sessionId
    await mockTransport.onmessage?.(
      JSON.stringify({id: messageId, result: {}}),
    );

    // Wait for the send to resolve to clean up
    await sendPromise;

    // Verify that session.onMessage was called because the patch added sessionId
    sinon.assert.calledOnce(onMessageSpy);

    const receivedMessage = onMessageSpy.getCall(0).args[0];

    function hasSessionId(obj: unknown): obj is {sessionId: string} {
      return typeof obj === 'object' && obj !== null && 'sessionId' in obj;
    }

    if (!hasSessionId(receivedMessage)) {
      throw new Error('Message missing sessionId');
    }
    assert.strictEqual(receivedMessage.sessionId, sessionId);
  });

  it('suppresses session not found errors', async () => {
    const mockTransport: {
      send(msg: string): void;
      onmessage?: (msg: string) => void;
      onclose?: () => void;
      close(): void;
    } = {
      send() {
        /* No-op */
      },
      close() {
        /* No-op */
      },
    };
    const transportSendSpy = sinon.spy(mockTransport, 'send');
    const connection = new Connection('http://localhost', mockTransport);
    const promise = connection.send('Browser.getVersion', undefined);

    // Get the ID from the sent message
    sinon.assert.calledOnce(transportSendSpy);
    const sentMessage = transportSendSpy.getCall(0).args[0];
    const messageId = JSON.parse(sentMessage).id;

    // Simulate receiving the specific error
    await mockTransport.onmessage?.(
      JSON.stringify({
        id: messageId,
        error: {code: -32001, message: 'Session with given id not found.'},
      }),
    );

    // Verify that the promise resolved (error was suppressed)
    const result = await promise;
    assert.deepStrictEqual(result, {});
  });
});
