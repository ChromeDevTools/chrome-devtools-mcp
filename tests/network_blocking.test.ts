/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {describe, it} from 'node:test';

import {emulate} from '../src/tools/emulation.js';
import {lighthouseAudit} from '../src/tools/lighthouse.js';
import {navigatePage} from '../src/tools/pages.js';
import {evaluateScript} from '../src/tools/script.js';

import {serverHooks} from './server.js';
import {withMcpContext} from './utils.js';

describe('Network Blocking Integration', () => {
  const server = serverHooks();

  it('blocks URLs in blocklist', async () => {
    server.addHtmlRoute('/allowed.html', '<html><body>Allowed</body></html>');
    server.addHtmlRoute('/blocked.html', '<html><body>Blocked</body></html>');

    const blockedUrlPattern = [server.getRoute('/blocked.html')];
    await withMcpContext(
      async (response, context) => {
        const allowedUrl = server.getRoute('/allowed.html');
        await navigatePage().handler(
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
        await evaluateScript().handler(
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
        await evaluateScript().handler(
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
      async (response, context) => {
        const allowedUrl = server.getRoute('/allowed.html');
        await navigatePage().handler(
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
        await evaluateScript().handler(
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
        await evaluateScript().handler(
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
      async (response, context) => {
        const allowedUrl = server.getRoute('/allowed.html');
        await navigatePage().handler(
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
        await evaluateScript().handler(
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

        await lighthouseAudit.handler(
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
        await evaluateScript().handler(
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

  it('does not let Lighthouse leak an excluded origin via a robots.txt redirect (regression for #2567)', async () => {
    // A second, entirely separate origin that is NOT covered by the
    // allowlist below -- records whether it was ever reached and serves a
    // canary body that must never reach the Lighthouse report.
    const CANARY = 'CANARY_SHOULD_NOT_LEAK_2567';
    let excludedOriginHit = false;
    const excludedServer = http.createServer((_req, res) => {
      excludedOriginHit = true;
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end(CANARY);
    });
    await new Promise<void>(resolve =>
      excludedServer.listen(0, '127.0.0.1', resolve),
    );
    const excludedPort = (excludedServer.address() as AddressInfo).port;
    const excludedRobotsUrl = `http://127.0.0.1:${excludedPort}/robots.txt`;

    try {
      let allowedRobotsHit = false;
      server.addHtmlRoute('/', '<html><body>Allowed</body></html>');
      server.addRoute('/robots.txt', (_req, res) => {
        allowedRobotsHit = true;
        res.writeHead(302, {Location: excludedRobotsUrl});
        res.end();
      });

      const allowedUrl = server.getRoute('/');
      const allowedUrlPattern = [`${server.baseUrl}/*`];

      await withMcpContext(
        async (response, context) => {
          await navigatePage().handler(
            {
              params: {url: allowedUrl},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );

          // Sanity check: a direct page-initiated fetch to the excluded
          // origin is still blocked -- proves this fix doesn't touch the
          // existing guardrail mechanism for ordinary requests.
          response.resetResponseLineForTesting();
          await evaluateScript().handler(
            {
              params: {
                function: `async () => {
                  try {
                    await fetch("${excludedRobotsUrl}", { signal: AbortSignal.timeout(5000) });
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
            'A direct page fetch to the excluded origin should be blocked',
          );
          excludedOriginHit = false;

          await lighthouseAudit.handler(
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
          assert.strictEqual(
            excludedOriginHit,
            false,
            'Lighthouse must not reach the excluded origin at all',
          );
          assert.strictEqual(
            allowedRobotsHit,
            true,
            'Lighthouse must have actually requested the redirecting robots.txt -- otherwise this test would pass even if the redirect were never followed',
          );

          const reportPaths = response.attachedLighthouseResult?.reports;
          assert.ok(reportPaths?.length, 'Expected saved report paths');
          for (const reportPath of reportPaths) {
            const reportContent = await fs.readFile(reportPath, 'utf-8');
            assert.ok(
              !reportContent.includes(CANARY),
              `Report ${reportPath} must not contain the excluded origin's content`,
            );
          }
        },
        {
          allowedUrlPattern,
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        excludedServer.close(err => (err ? reject(err) : resolve())),
      );
    }
  });

  it('throws error when trying to emulate network conditions while blocklist is configured', async () => {
    const blockedUrlPattern = ['*://*/*'];
    await withMcpContext(
      async (response, context) => {
        // Attempting to emulate network conditions should throw an error.
        await assert.rejects(async () => {
          await emulate.handler(
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
        await emulate.handler(
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
