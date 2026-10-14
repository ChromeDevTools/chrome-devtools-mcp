/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {describe, it} from 'node:test';

import type {McpContext} from '../src/McpContext.js';
import type {McpResponse} from '../src/McpResponse.js';
import {emulate} from '../src/tools/emulation.js';
import {lighthouseAudit} from '../src/tools/lighthouse.js';
import {navigatePage} from '../src/tools/pages.js';
import {evaluateScript} from '../src/tools/script.js';
import type {ParsedArguments} from '../src/config/ConfigParser.js';

import {serverHooks, type TestServer} from './server.js';
import {withMcpContext} from './utils.js';

/**
 * Serves a service worker that forwards `/blocked/*` requests from controlled
 * pages and fetches `/blocked/swdata.json` on its own during `install`.
 * Returns the list of request paths the server actually received.
 */
function setupServiceWorkerFixture(server: TestServer): {received: string[]} {
  const received: string[] = [];
  const json = (req: IncomingMessage, res: ServerResponse) => {
    received.push(req.url ?? '');
    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end('{"secret":"BLOCKED-DATA"}');
  };
  server.addRoute('/blocked/data.json', json);
  server.addRoute('/blocked/swdata.json', json);
  server.addRoute('/sw.js', (req, res) => {
    received.push(req.url ?? '');
    res.writeHead(200, {
      'content-type': 'text/javascript',
      'cache-control': 'no-store',
    });
    res.end(`
      self.addEventListener('install', e => {
        e.waitUntil(
          fetch('/blocked/swdata.json')
            .catch(() => {})
            .then(() => self.skipWaiting()),
        );
      });
      self.addEventListener('activate', e => e.waitUntil(clients.claim()));
      self.addEventListener('fetch', e => {
        if (new URL(e.request.url).pathname.startsWith('/blocked/')) {
          e.respondWith(fetch(e.request.url));
        }
      });
    `);
  });
  server.addHtmlRoute('/install.html', '<html><body>install</body></html>');
  server.addHtmlRoute('/page.html', '<html><body>page</body></html>');
  return {received};
}

async function evaluate(
  fn: string,
  response: McpResponse,
  context: McpContext,
  args: ParsedArguments,
): Promise<unknown> {
  response.resetResponseLineForTesting();
  await evaluateScript(args).handler(
    {params: {function: fn}},
    response,
    context,
  );
  const line = response.responseLines.at(2);
  assert.ok(line, `unexpected response: ${response.responseLines.join('\n')}`);
  return line === 'undefined' ? undefined : JSON.parse(line);
}

async function assertServiceWorkerRequestsAreBlocked(
  server: TestServer,
  received: string[],
  response: McpResponse,
  context: McpContext,
  args: ParsedArguments,
): Promise<void> {
  try {
    await navigatePage(args).handler(
      {
        params: {url: server.getRoute('/install.html')},
        page: context.getSelectedMcpPage(),
      },
      response,
      context,
    );
    // Control: the worker script is allowed, so it must register.
    assert.strictEqual(
      await evaluate(
        `async () => {
          await navigator.serviceWorker.register('/sw.js');
          await navigator.serviceWorker.ready;
          return 'sw ready';
        }`,
        response,
        context,
        args,
      ),
      'sw ready',
    );
    assert.ok(received.includes('/sw.js'), 'worker script should be fetched');

    await navigatePage(args).handler(
      {
        params: {url: server.getRoute('/page.html')},
        page: context.getSelectedMcpPage(),
      },
      response,
      context,
    );
    assert.strictEqual(
      await evaluate(
        String(() => !!navigator.serviceWorker.controller),
        response,
        context,
        args,
      ),
      true,
      'page should be controlled by the service worker',
    );

    assert.strictEqual(
      await evaluate(
        `async () => {
          try {
            await fetch('/blocked/data.json', { signal: AbortSignal.timeout(5000) });
            return 'SUCCESS';
          } catch (err) {
            return err instanceof Error ? err.message : String(err);
          }
        }`,
        response,
        context,
        args,
      ),
      'Failed to fetch',
      'fetch forwarded by the service worker should be blocked',
    );
    assert.deepStrictEqual(
      received.filter(path => path.startsWith('/blocked/')),
      [],
      'no blocked request should reach the server',
    );
  } finally {
    // The browser is shared between tests with the same launch options, so
    // make sure the registration does not leak into other tests.
    await evaluate(
      `async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }`,
      response,
      context,
      args,
    );
  }
}

describe('Network Blocking Integration', () => {
  const server = serverHooks();

  it('blocks requests issued by a service worker (blocklist)', async () => {
    const {received} = setupServiceWorkerFixture(server);
    await withMcpContext(
      async (response, context, args) => {
        await assertServiceWorkerRequestsAreBlocked(
          server,
          received,
          response,
          context,
          args,
        );
      },
      {
        blockedUrlPattern: [`${server.baseUrl}/blocked/*`],
      },
    );
  });

  it('blocks requests issued by a service worker (allowlist)', async () => {
    const {received} = setupServiceWorkerFixture(server);
    await withMcpContext(
      async (response, context, args) => {
        await assertServiceWorkerRequestsAreBlocked(
          server,
          received,
          response,
          context,
          args,
        );
      },
      {
        allowedUrlPattern: [
          server.getRoute('/install.html'),
          server.getRoute('/page.html'),
          server.getRoute('/sw.js'),
        ],
      },
    );
  });

  it('blocks URLs in blocklist', async () => {
    server.addHtmlRoute('/allowed.html', '<html><body>Allowed</body></html>');
    server.addHtmlRoute('/blocked.html', '<html><body>Blocked</body></html>');

    const blockedUrlPattern = [server.getRoute('/blocked.html')];
    await withMcpContext(
      async (response, context, args) => {
        const allowedUrl = server.getRoute('/allowed.html');
        await navigatePage(args).handler(
          {
            params: {url: allowedUrl},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          `Successfully navigated to ${allowedUrl}.`,
        );

        response.resetResponseLineForTesting();
        await evaluateScript(args).handler(
          {
            params: {function: String(() => document.body.textContent)},
          },
          response,
          context,
        );
        assert.strictEqual(
          JSON.parse(response.responseLines.at(2)!),
          'Allowed',
        );

        const blockedUrl = server.getRoute('/blocked.html');
        response.resetResponseLineForTesting();
        await evaluateScript(args).handler(
          {
            params: {
              function: `async () => {
                try {
                  await fetch("${blockedUrl}", { signal: AbortSignal.timeout(5000) });
                  return 'SUCCESS';
                } catch (err) {
                  return err instanceof Error ? err.message : String(err);
                }
              }`,
            },
          },
          response,
          context,
        );

        assert.strictEqual(
          JSON.parse(response.responseLines.at(2)!),
          'Failed to fetch',
        );
      },
      {
        blockedUrlPattern,
      },
    );
  });

  it('blocks URLs not in allowlist', async () => {
    server.addHtmlRoute('/allowed.html', '<html><body>Allowed</body></html>');
    server.addHtmlRoute('/blocked.html', '<html><body>Blocked</body></html>');

    const allowedUrlPattern = [server.getRoute('/allowed.html')];

    await withMcpContext(
      async (response, context, args) => {
        const allowedUrl = server.getRoute('/allowed.html');
        await navigatePage(args).handler(
          {
            params: {url: allowedUrl},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          `Successfully navigated to ${allowedUrl}.`,
        );

        response.resetResponseLineForTesting();
        await evaluateScript(args).handler(
          {
            params: {function: String(() => document.body.textContent)},
          },
          response,
          context,
        );
        assert.strictEqual(
          JSON.parse(response.responseLines.at(2)!),
          'Allowed',
        );

        const blockedUrl = server.getRoute('/blocked.html');
        response.resetResponseLineForTesting();
        await evaluateScript(args).handler(
          {
            params: {
              function: `async () => {
                try {
                  await fetch("${blockedUrl}", { signal: AbortSignal.timeout(5000) });
                  return 'SUCCESS';
                } catch (err) {
                  return err instanceof Error ? err.message : String(err);
                }
              }`,
            },
          },
          response,
          context,
        );

        assert.strictEqual(
          JSON.parse(response.responseLines.at(2)!),
          'Failed to fetch',
        );
      },
      {
        allowedUrlPattern,
      },
    );
  });

  it('respects blocklist after Lighthouse audits', async () => {
    server.addHtmlRoute('/allowed.html', '<html><body>Allowed</body></html>');
    server.addHtmlRoute('/blocked.html', '<html><body>Blocked</body></html>');

    const blockedUrlPattern = [server.getRoute('/blocked.html')];
    await withMcpContext(
      async (response, context, args) => {
        const allowedUrl = server.getRoute('/allowed.html');
        await navigatePage(args).handler(
          {
            params: {url: allowedUrl},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          `Successfully navigated to ${allowedUrl}.`,
        );

        const blockedUrl = server.getRoute('/blocked.html');

        // Verifies fetch is blocked before Lighthouse audit
        response.resetResponseLineForTesting();
        await evaluateScript(args).handler(
          {
            params: {
              function: `async () => {
                try {
                  await fetch("${blockedUrl}", { signal: AbortSignal.timeout(5000) });
                  return 'SUCCESS';
                } catch (err) {
                  return err instanceof Error ? err.message : String(err);
                }
              }`,
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          JSON.parse(response.responseLines.at(2)!),
          'Failed to fetch',
          'Fetch should be blocked before audit',
        );

        await lighthouseAudit(args).handler(
          {
            params: {
              mode: 'navigation',
              device: 'desktop',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.equal(
          response.attachedLighthouseResult?.summary.mode,
          'navigation',
        );

        // 2. Verify fetch remains blocked AFTER Lighthouse audit
        response.resetResponseLineForTesting();
        await evaluateScript(args).handler(
          {
            params: {
              function: `async () => {
                try {
                  await fetch("${blockedUrl}", { signal: AbortSignal.timeout(5000) });
                  return 'SUCCESS';
                } catch (err) {
                  return err instanceof Error ? err.message : String(err);
                }
              }`,
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          JSON.parse(response.responseLines.at(2)!),
          'Failed to fetch',
          'Fetch should still be blocked after audit',
        );
      },
      {
        blockedUrlPattern,
      },
    );
  });

  it('throws error when trying to emulate network conditions while blocklist is configured', async () => {
    const blockedUrlPattern = ['*://*/*'];
    await withMcpContext(
      async (response, context, args) => {
        // Attempting to emulate network conditions should throw an error.
        await assert.rejects(async () => {
          await emulate(args).handler(
            {
              params: {
                networkConditions: 'Offline',
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        }, /Network throttling is not supported when network blocking \(allowlist\/blocklist\) is configured\./);

        // Attempting to emulate CPU rate or other things should succeed without errors.
        await emulate(args).handler(
          {
            params: {
              cpuThrottlingRate: 2,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Emulation configured successfully',
        );
      },
      {
        blockedUrlPattern,
      },
    );
  });
});
