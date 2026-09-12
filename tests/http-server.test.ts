/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {describe, it} from 'node:test';

import {parser} from '../src/config/mcp-options.js';
import {startMcpHttpServer} from '../src/http-server.js';

const ACCEPT_HEADER = 'application/json, text/event-stream';
const PROTOCOL_VERSION = '2025-03-26';

const serverArgs = parser(
  '0.0.0',
  ['node', 'http-server.test.js', '--no-usage-statistics'],
  {},
).parseSync();

const initializeMessage = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'http-server-test',
      version: '1.0.0',
    },
  },
};

function sessionId(response: Response): string {
  const value = response.headers.get('mcp-session-id');
  if (value === null) {
    throw new Error('Expected an MCP session ID');
  }
  return value;
}

async function post(
  url: URL,
  message: object,
  session?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: ACCEPT_HEADER,
    'Content-Type': 'application/json',
  };
  if (session !== undefined) {
    headers['Mcp-Session-Id'] = session;
    headers['Mcp-Protocol-Version'] = PROTOCOL_VERSION;
  }
  return await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });
}

async function initialize(url: URL): Promise<string> {
  const response = await post(url, initializeMessage);
  assert.equal(response.status, 200);
  await response.text();
  return sessionId(response);
}
function statusWithHost(url: URL, host: string): Promise<number> {
  const {promise, resolve, reject} = Promise.withResolvers<number>();
  const request = httpRequest(url, {headers: {Host: host}}, response => {
    response.resume();
    response.once('end', () => {
      resolve(response.statusCode ?? 0);
    });
  });
  request.once('error', reject);
  request.end();
  return promise;
}

describe('Streamable HTTP MCP server', () => {
  it('rejects invalid routes, methods, hosts, and origins before protocol handling', async () => {
    const service = await startMcpHttpServer(serverArgs, {port: 0});
    try {
      const wrongRoute = await fetch(`${service.url.origin}/not-mcp`);
      assert.equal(wrongRoute.status, 404);

      const queryRoute = await fetch(`${service.url.href}?query=true`);
      assert.equal(queryRoute.status, 404);

      const methodResponse = await fetch(service.url, {method: 'PUT'});
      assert.equal(methodResponse.status, 405);
      assert.equal(methodResponse.headers.get('allow'), 'GET, POST, DELETE');

      assert.equal(await statusWithHost(service.url, 'attacker.example'), 403);

      const originResponse = await fetch(service.url, {
        headers: {Origin: 'https://attacker.example'},
      });
      assert.equal(originResponse.status, 403);
    } finally {
      await service.close();
    }
  });
  it('admits only valid initialize requests and enforces request limits', async () => {
    const service = await startMcpHttpServer(serverArgs, {
      port: 0,
      maxSessions: 1,
    });
    try {
      const jsonBody = JSON.stringify(initializeMessage);
      const missingAccept = await fetch(service.url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: jsonBody,
      });
      assert.equal(missingAccept.status, 406);
      await missingAccept.text();

      const missingContentType = await fetch(service.url, {
        method: 'POST',
        headers: {Accept: ACCEPT_HEADER},
        body: jsonBody,
      });
      assert.equal(missingContentType.status, 415);
      await missingContentType.text();

      const malformed = await fetch(service.url, {
        method: 'POST',
        headers: {
          Accept: ACCEPT_HEADER,
          'Content-Type': 'application/json',
        },
        body: '{',
      });
      assert.equal(malformed.status, 400);
      await malformed.text();

      const noInitialize = await fetch(service.url, {
        method: 'POST',
        headers: {
          Accept: ACCEPT_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'ping'}),
      });
      assert.equal(noInitialize.status, 400);
      await noInitialize.text();

      const oversized = await fetch(service.url, {
        method: 'POST',
        headers: {
          Accept: ACCEPT_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {padding: 'x'.repeat(4 * 1024 * 1024)},
        }),
      });
      assert.equal(oversized.status, 413);
      await oversized.text();

      const firstSession = await initialize(service.url);
      const overLimit = await post(service.url, initializeMessage);
      assert.equal(overLimit.status, 503);
      await overLimit.text();

      const ping = await post(
        service.url,
        {jsonrpc: '2.0', id: 2, method: 'ping'},
        firstSession,
      );
      assert.equal(ping.status, 200);
      await ping.text();
    } finally {
      await service.close();
    }
  });

  it('expires idle sessions without retaining their transport', async () => {
    const service = await startMcpHttpServer(serverArgs, {
      port: 0,
      sessionIdleTimeoutMs: 20,
    });
    try {
      const session = await initialize(service.url);
      const {promise, resolve} = Promise.withResolvers<void>();
      setTimeout(resolve, 50);
      await promise;
      const expired = await post(
        service.url,
        {jsonrpc: '2.0', id: 2, method: 'ping'},
        session,
      );
      assert.equal(expired.status, 404);
      await expired.text();
    } finally {
      await service.close();
    }
  });

  it('routes independent sessions and only closes the requested session', async () => {
    const service = await startMcpHttpServer(serverArgs, {port: 0});
    try {
      const firstSession = await initialize(service.url);
      const secondSession = await initialize(service.url);
      assert.notEqual(firstSession, secondSession);

      const missingSession = await fetch(service.url, {
        headers: {Accept: ACCEPT_HEADER},
      });
      assert.equal(missingSession.status, 400);

      const firstPing = await post(
        service.url,
        {jsonrpc: '2.0', id: 2, method: 'ping'},
        firstSession,
      );
      assert.equal(firstPing.status, 200);
      await firstPing.text();
      const malformedEstablished = await fetch(service.url, {
        method: 'POST',
        headers: {
          Accept: ACCEPT_HEADER,
          'Content-Type': 'application/json',
          'Mcp-Session-Id': firstSession,
          'Mcp-Protocol-Version': PROTOCOL_VERSION,
        },
        body: '{',
      });
      assert.equal(malformedEstablished.status, 400);
      await malformedEstablished.text();

      const rejectedDelete = await fetch(service.url, {
        method: 'DELETE',
        headers: {
          Accept: ACCEPT_HEADER,
          'Mcp-Session-Id': firstSession,
          'Mcp-Protocol-Version': 'unsupported-version',
        },
      });
      assert.equal(rejectedDelete.status, 400);
      await rejectedDelete.text();

      const pingAfterRejectedDelete = await post(
        service.url,
        {jsonrpc: '2.0', id: 5, method: 'ping'},
        firstSession,
      );
      assert.equal(pingAfterRejectedDelete.status, 200);
      await pingAfterRejectedDelete.text();

      const deleteFirst = await fetch(service.url, {
        method: 'DELETE',
        headers: {
          Accept: ACCEPT_HEADER,
          'Mcp-Session-Id': firstSession,
          'Mcp-Protocol-Version': PROTOCOL_VERSION,
        },
      });
      assert.equal(deleteFirst.status, 200);

      const closedFirst = await post(
        service.url,
        {jsonrpc: '2.0', id: 3, method: 'ping'},
        firstSession,
      );
      assert.equal(closedFirst.status, 404);

      const secondPing = await post(
        service.url,
        {jsonrpc: '2.0', id: 4, method: 'ping'},
        secondSession,
      );
      assert.equal(secondPing.status, 200);
      await secondPing.text();
    } finally {
      await service.close();
    }
  });
});
