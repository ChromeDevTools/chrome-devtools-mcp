/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseArguments} from '../src/bin/chrome-devtools-mcp-cli-options.js';
import {startChatGptHttpServer} from '../src/chatgpt-http-server.js';

function randomPort(): number {
  const min = 21_000;
  const max = 29_000;
  return Math.floor(Math.random() * (max - min + 1) + min);
}

describe('ChatGPT HTTP server', () => {
  it('serves health, OAuth metadata, and auth challenge', async () => {
    const port = randomPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const env = {
      CHATGPT_MCP_BASE_URL: baseUrl,
      CHATGPT_MCP_LOGIN_SECRET: 'test-login-secret',
      CHATGPT_MCP_TOKEN: 'test-token',
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
    };
    const args = parseArguments(
      '1.0.0',
      [
        'node',
        'main.js',
        '--chatgpt',
        '--chatgpt-port',
        String(port),
      ],
      env,
    );

    assert.strictEqual(args.chatgpt, true);
    assert.strictEqual(args.chatgptPort, port);

    const server = await startChatGptHttpServer(args, {}, env);
    try {
      const health = await fetch(`${baseUrl}/health`);
      assert.strictEqual(health.status, 200);
      const healthJson = await health.json();
      assert.strictEqual(healthJson.status, 'ok');
      assert.strictEqual(healthJson.oauth_enabled, true);

      const metadata = await fetch(
        `${baseUrl}/.well-known/oauth-authorization-server`,
      );
      assert.strictEqual(metadata.status, 200);
      const metadataJson = await metadata.json();
      assert.strictEqual(metadataJson.authorization_endpoint, `${baseUrl}/authorize`);
      assert.strictEqual(metadataJson.token_endpoint, `${baseUrl}/token`);
      assert.strictEqual(metadataJson.registration_endpoint, `${baseUrl}/register`);

      const unauthorized = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize'}),
      });
      assert.strictEqual(unauthorized.status, 401);
      assert.match(
        unauthorized.headers.get('www-authenticate') ?? '',
        /resource_metadata=/,
      );
    } finally {
      await server.close();
    }
  });
});
