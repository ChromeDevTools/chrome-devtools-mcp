/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {PuppeteerDevToolsConnection} from '../../src/devtools/DevToolsConnectionAdapter.js';
import type {CDPSession} from '../../src/third_party/index.js';
import {mockListener} from '../utils.js';

function getMockSession(sessionsById: Record<string, unknown>): CDPSession {
  const connection = {
    session(id: string) {
      return sessionsById[id];
    },
  };
  return {
    ...mockListener(),
    id() {
      return 'root-session';
    },
    connection() {
      return connection;
    },
  } as unknown as CDPSession;
}

describe('PuppeteerDevToolsConnection', () => {
  it('reports an unknown session as an error instead of throwing', async () => {
    const session = getMockSession({'root-session': {}});
    const connection = new PuppeteerDevToolsConnection(session);

    // The page this session belonged to is gone, which is what happens when a
    // tab closes while commands for it are still in flight.
    const response = await connection.send(
      'Network.loadNetworkResource' as never,
      {} as never,
      'session-that-went-away',
    );

    assert.ok('error' in response, 'expected an error response');
    assert.match(response.error.message, /Unknown session/);
  });

  it('forwards commands to the session it belongs to', async () => {
    const calls: string[] = [];
    const target = {
      send(method: string) {
        calls.push(method);
        return Promise.resolve({ok: true});
      },
    };
    const session = getMockSession({'a-session': target});
    const connection = new PuppeteerDevToolsConnection(session);

    const response = await connection.send(
      'Page.enable' as never,
      {} as never,
      'a-session',
    );

    assert.deepStrictEqual(calls, ['Page.enable']);
    assert.deepStrictEqual(response, {result: {ok: true}});
  });
});
