/**
 * @license
 * Copyright 2026 Colin (@cejor6)
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {after, before, describe, it} from 'node:test';

import {parseArguments} from '../src/bin/chrome-devtools-mcp-cli-options.js';
import {
  type HttpTransportHandle,
  isLoopbackHost,
  startHttpTransport,
} from '../src/HttpTransport.js';
import {MutexRegistry} from '../src/Mutex.js';

describe('isLoopbackHost', () => {
  it('accepts 127.0.0.1', () => {
    assert.strictEqual(isLoopbackHost('127.0.0.1'), true);
  });
  it('accepts localhost', () => {
    assert.strictEqual(isLoopbackHost('localhost'), true);
  });
  it('accepts ::1', () => {
    assert.strictEqual(isLoopbackHost('::1'), true);
  });
  it('rejects 0.0.0.0', () => {
    assert.strictEqual(isLoopbackHost('0.0.0.0'), false);
  });
  it('rejects public IP', () => {
    assert.strictEqual(isLoopbackHost('192.168.1.1'), false);
  });
});

describe('startHttpTransport bearer auth', () => {
  let handle: HttpTransportHandle | undefined;
  let baseUrl = '';
  const TOKEN = 'secret-token-xyz';

  before(async () => {
    const args = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--http-port', '0'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );

    const sharedState = {
      mutexRegistry: new MutexRegistry(),
      getContext: async (): Promise<never> => {
        throw new Error(
          'getContext should not be reached in auth-rejection tests',
        );
      },
    };

    handle = await startHttpTransport({
      host: '127.0.0.1',
      port: 0,
      token: TOKEN,
      args,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sharedState: sharedState as any,
    });

    const addr = handle.server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to get bound address');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (handle) {
      await handle.close();
    }
  });

  it('rejects request without Authorization header with 401', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {method: 'POST'});
    assert.strictEqual(res.status, 401);
    assert.ok(res.headers.get('www-authenticate')?.startsWith('Bearer'));
  });

  it('rejects request with wrong token with 401', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {Authorization: 'Bearer wrong-token'},
    });
    assert.strictEqual(res.status, 401);
  });

  it('rejects malformed Authorization header', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {Authorization: 'NotBearer something'},
    });
    assert.strictEqual(res.status, 401);
  });

  it('rejects token of different length', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {Authorization: 'Bearer x'},
    });
    assert.strictEqual(res.status, 401);
  });
});

describe('parseArguments http validation', () => {
  // Note: the non-loopback-without-token rejection is enforced by yargs's
  // .check() callback, but yargs's default failure handler intercepts the
  // throw and calls process.exit. That path is exercised at CLI startup;
  // it can't be cleanly asserted via assert.throws here. The positive paths
  // below cover the parsing logic.

  it('accepts non-loopback host when token is provided', () => {
    const args = parseArguments(
      '1.0.0',
      [
        'node',
        'script.js',
        '--http-port',
        '3000',
        '--http-host',
        '0.0.0.0',
        '--http-token',
        'abc',
      ],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );
    assert.strictEqual(args.httpPort, 3000);
    assert.strictEqual(args.httpHost, '0.0.0.0');
    assert.strictEqual(args.httpToken, 'abc');
  });

  it('accepts loopback host explicitly without token', () => {
    const args = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--http-port', '3000', '--http-host', '127.0.0.1'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );
    assert.strictEqual(args.httpPort, 3000);
    assert.strictEqual(args.httpHost, '127.0.0.1');
  });

  it('accepts --http-port with no host (default applied at use-site)', () => {
    const args = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--http-port', '3000'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );
    assert.strictEqual(args.httpPort, 3000);
    assert.strictEqual(args.httpHost, undefined);
  });
});
