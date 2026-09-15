/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
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
