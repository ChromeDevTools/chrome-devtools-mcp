/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emulate } from '../src/tools/emulation.js';
import { lighthouseAudit } from '../src/tools/lighthouse.js';
import { navigatePage } from '../src/tools/pages.js';
import { evaluateScript } from '../src/tools/script.js';
import { serverHooks } from './server.js';
import { withMcpContext } from './utils.js';
/**
 * Serves a service worker that forwards `/blocked/*` requests from controlled
 * pages and fetches `/blocked/swdata.json` on its own during `install`.
 * Returns the list of request paths the server actually received.
 */
function setupServiceWorkerFixture(server) {
    const received = [];
    const json = (req, res) => {
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
    return { received };
}
/**
 * Serves `/allowed.html` and `/blocked.html` and records the request paths
 * the server actually received, so a test can tell "blocked" apart from
 * "reached the server but stalled".
 */
function setupBlockedPageFixture(server) {
    const received = [];
    const html = (body) => (req, res) => {
        received.push(req.url ?? '');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<html><body>${body}</body></html>`);
    };
    server.addRoute('/allowed.html', html('Allowed'));
    server.addRoute('/blocked.html', html('Blocked'));
    return { received };
}
async function evaluate(fn, response, context, args) {
    response.resetResponseLineForTesting();
    await evaluateScript(args).handler({ params: { function: fn } }, response, context);
    const line = response.responseLines.at(2);
    assert.ok(line, `unexpected response: ${response.responseLines.join('\n')}`);
    return line === 'undefined' ? undefined : JSON.parse(line);
}
/**
 * Fetches `url` from the selected page and returns the outcome. The timeout
 * is generous on purpose: a blocked request fails synchronously in the
 * network service, so the budget only matters on an overloaded CI runner.
 */
async function fetchFromPage(url, response, context, args) {
    return await evaluate(`async () => {
      try {
        await fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(30000) });
        return 'SUCCESS';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }`, response, context, args);
}
async function assertFetchIsBlocked(url, received, response, context, args, message = 'blocked request') {
    const result = await fetchFromPage(url, response, context, args);
    const path = new URL(url).pathname;
    assert.deepStrictEqual(received.filter(p => p === path), [], `${message}: the request reached the server`);
    assert.strictEqual(result, 'Failed to fetch', message);
}
async function assertServiceWorkerRequestsAreBlocked(server, received, response, context, args) {
    try {
        await navigatePage(args).handler({
            params: { url: server.getRoute('/install.html') },
            page: context.getSelectedMcpPage(),
        }, response, context);
        // Control: the worker script is allowed, so it must register.
        assert.strictEqual(await evaluate(`async () => {
          await navigator.serviceWorker.register('/sw.js');
          await navigator.serviceWorker.ready;
          return 'sw ready';
        }`, response, context, args), 'sw ready');
        assert.ok(received.includes('/sw.js'), 'worker script should be fetched');
        await navigatePage(args).handler({
            params: { url: server.getRoute('/page.html') },
            page: context.getSelectedMcpPage(),
        }, response, context);
        assert.strictEqual(await evaluate(String(() => !!navigator.serviceWorker.controller), response, context, args), true, 'page should be controlled by the service worker');
        assert.strictEqual(await fetchFromPage('/blocked/data.json', response, context, args), 'Failed to fetch', 'fetch forwarded by the service worker should be blocked');
        assert.deepStrictEqual(received.filter(path => path.startsWith('/blocked/')), [], 'no blocked request should reach the server');
    }
    finally {
        // The browser is shared between tests with the same launch options, so
        // make sure the registration does not leak into other tests.
        await evaluate(`async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }`, response, context, args);
    }
}
describe('Network Blocking Integration', () => {
    const server = serverHooks();
    it('blocks requests issued by a service worker (blocklist)', async () => {
        const { received } = setupServiceWorkerFixture(server);
        await withMcpContext(async (response, context, args) => {
            await assertServiceWorkerRequestsAreBlocked(server, received, response, context, args);
        }, {
            blockedUrlPattern: [`${server.baseUrl}/blocked/*`],
        });
    });
    it('blocks requests issued by a service worker (allowlist)', async () => {
        const { received } = setupServiceWorkerFixture(server);
        await withMcpContext(async (response, context, args) => {
            await assertServiceWorkerRequestsAreBlocked(server, received, response, context, args);
        }, {
            allowedUrlPattern: [
                server.getRoute('/install.html'),
                server.getRoute('/page.html'),
                server.getRoute('/sw.js'),
            ],
        });
    });
    it('blocks URLs in blocklist', async () => {
        const { received } = setupBlockedPageFixture(server);
        const blockedUrlPattern = [server.getRoute('/blocked.html')];
        await withMcpContext(async (response, context, args) => {
            const allowedUrl = server.getRoute('/allowed.html');
            await navigatePage(args).handler({
                params: { url: allowedUrl },
                page: context.getSelectedMcpPage(),
            }, response, context);
            assert.strictEqual(response.responseLines[0], `Successfully navigated to ${allowedUrl}.`);
            assert.strictEqual(await evaluate(String(() => document.body.textContent), response, context, args), 'Allowed');
            await assertFetchIsBlocked(server.getRoute('/blocked.html'), received, response, context, args);
        }, {
            blockedUrlPattern,
        });
    });
    it('blocks URLs not in allowlist', async () => {
        const { received } = setupBlockedPageFixture(server);
        const allowedUrlPattern = [server.getRoute('/allowed.html')];
        await withMcpContext(async (response, context, args) => {
            const allowedUrl = server.getRoute('/allowed.html');
            await navigatePage(args).handler({
                params: { url: allowedUrl },
                page: context.getSelectedMcpPage(),
            }, response, context);
            assert.strictEqual(response.responseLines[0], `Successfully navigated to ${allowedUrl}.`);
            assert.strictEqual(await evaluate(String(() => document.body.textContent), response, context, args), 'Allowed');
            await assertFetchIsBlocked(server.getRoute('/blocked.html'), received, response, context, args);
        }, {
            allowedUrlPattern,
        });
    });
    it('respects blocklist after Lighthouse audits', async () => {
        const { received } = setupBlockedPageFixture(server);
        const blockedUrlPattern = [server.getRoute('/blocked.html')];
        await withMcpContext(async (response, context, args) => {
            const allowedUrl = server.getRoute('/allowed.html');
            await navigatePage(args).handler({
                params: { url: allowedUrl },
                page: context.getSelectedMcpPage(),
            }, response, context);
            assert.strictEqual(response.responseLines[0], `Successfully navigated to ${allowedUrl}.`);
            const blockedUrl = server.getRoute('/blocked.html');
            await assertFetchIsBlocked(blockedUrl, received, response, context, args, 'Fetch should be blocked before audit');
            await lighthouseAudit(args).handler({
                params: {
                    mode: 'navigation',
                    device: 'desktop',
                },
                page: context.getSelectedMcpPage(),
            }, response, context);
            assert.equal(response.attachedLighthouseResult?.summary.mode, 'navigation');
            await assertFetchIsBlocked(blockedUrl, received, response, context, args, 'Fetch should still be blocked after audit');
        }, {
            blockedUrlPattern,
        });
    });
    it('throws error when trying to emulate network conditions while blocklist is configured', async () => {
        const blockedUrlPattern = ['*://*/*'];
        await withMcpContext(async (response, context, args) => {
            // Attempting to emulate network conditions should throw an error.
            await assert.rejects(async () => {
                await emulate(args).handler({
                    params: {
                        networkConditions: 'Offline',
                    },
                    page: context.getSelectedMcpPage(),
                }, response, context);
            }, /Network throttling is not supported when network blocking \(allowlist\/blocklist\) is configured\./);
            // Attempting to emulate CPU rate or other things should succeed without errors.
            await emulate(args).handler({
                params: {
                    cpuThrottlingRate: 2,
                },
                page: context.getSelectedMcpPage(),
            }, response, context);
            assert.strictEqual(response.responseLines[0], 'Emulation configured successfully');
        }, {
            blockedUrlPattern,
        });
    });
});
//# sourceMappingURL=network_blocking.test.js.map