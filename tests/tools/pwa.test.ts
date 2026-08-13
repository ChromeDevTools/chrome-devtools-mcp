/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  installPwa,
  uninstallPwa,
  launchPwa,
  getOsAppState,
} from '../../src/tools/pwa.js';
import {serverHooks} from '../server.js';
import {getTextContent, withMcpContext} from '../utils.js';

// The `PWA` CDP domain is only available over a pipe connection, which
// `withMcpContext` uses by default.
const PWA_BROWSER_OPTIONS = {};

// Served verbatim: the `<link rel="manifest">` must live in the document head,
// so this cannot go through the `html` test helper (which re-wraps content in
// its own document body).
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="alternate manifest" href="manifest.webmanifest" />
    <title>MCP Test PWA</title>
  </head>
  <body>
    <h1>MCP Test PWA</h1>
  </body>
</html>`;

const MANIFEST = JSON.stringify({
  id: 'pwa/',
  name: 'MCP Test PWA',
  short_name: 'MCPPWA',
  start_url: 'index.html',
  scope: '/pwa/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    {src: '/pptr.png', sizes: '192x192', type: 'image/png'},
    {src: '/pptr.png', sizes: '512x512', type: 'image/png'},
  ],
});

describe('pwa', () => {
  const server = serverHooks();

  afterEach(() => {
    sinon.restore();
  });

  function setupPwaRoutes(): {
    manifestId: string;
    startUrl: string;
    explicitUrl: string;
  } {
    server.addRoute('/pwa/index.html', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 200;
      res.end(INDEX_HTML);
    });
    server.addRoute('/pwa/manifest.webmanifest', (_req, res) => {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.statusCode = 200;
      res.end(MANIFEST);
    });
    server.addHtmlRoute(
      '/pwa/secondary.html',
      '<h1>Explicit PWA launch URL</h1>',
    );
    return {
      manifestId: `${server.baseUrl}/pwa/`,
      startUrl: `${server.baseUrl}/pwa/index.html`,
      explicitUrl: `${server.baseUrl}/pwa/secondary.html`,
    };
  }

  it('installs a PWA, reads its OS state, and uninstalls it', async () => {
    const {manifestId, startUrl} = setupPwaRoutes();
    await withMcpContext(
      async (response, context) => {
        await installPwa.handler(
          {params: {manifestId, installUrlOrBundleUrl: startUrl}},
          response,
          context,
        );
        assert.ok(
          response.responseLines.some(l => l.includes(manifestId)),
          'install response should reference the manifest ID',
        );

        response.resetResponseLineForTesting();
        await getOsAppState.handler({params: {manifestId}}, response, context);
        const stateOutput = response.responseLines.join('\n');
        assert.ok(
          stateOutput.includes('Badge count: 0'),
          `expected a badge count in OS state, got: ${stateOutput}`,
        );
        assert.ok(
          stateOutput.includes('File handlers: []'),
          `expected file handlers in OS state, got: ${stateOutput}`,
        );

        const includePages = sinon.spy(response, 'setIncludePages');
        await uninstallPwa.handler({params: {manifestId}}, response, context);
        assert.ok(
          includePages.calledOnce,
          'uninstall should refresh the page list after closing app windows',
        );

        // Querying OS state after uninstall should reject.
        await assert.rejects(
          getOsAppState.handler({params: {manifestId}}, response, context),
        );
      },
      PWA_BROWSER_OPTIONS,
      {categoryPwa: true},
    );
  });

  it('does not require a selected page for browser-scoped operations', async () => {
    const {manifestId, startUrl} = setupPwaRoutes();
    await withMcpContext(
      async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        sinon
          .stub(context, 'getSelectedMcpPage')
          .throws(new Error('No page selected'));
        const install = sinon.stub(context, 'installPWA').resolves(manifestId);
        const launch = sinon.stub(context, 'launchPWA').resolves(page);
        const getState = sinon
          .stub(context, 'getPWAState')
          .resolves({badgeCount: 0, fileHandlers: []});
        const uninstall = sinon.stub(context, 'uninstallPWA').resolves();

        await installPwa.handler(
          {params: {manifestId, installUrlOrBundleUrl: startUrl}},
          response,
          context,
        );
        await launchPwa.handler({params: {manifestId}}, response, context);
        await getOsAppState.handler({params: {manifestId}}, response, context);
        await uninstallPwa.handler({params: {manifestId}}, response, context);

        assert.ok(install.calledOnce);
        assert.ok(launch.calledOnce);
        assert.ok(getState.calledOnce);
        assert.ok(uninstall.calledOnce);
      },
      PWA_BROWSER_OPTIONS,
      {categoryPwa: true},
    );
  });

  it('launches an installed PWA in a standalone window', async () => {
    const {manifestId, startUrl} = setupPwaRoutes();
    await withMcpContext(
      async (response, context) => {
        await installPwa.handler(
          {
            params: {
              manifestId,
              installUrlOrBundleUrl: startUrl,
              displayMode: 'standalone',
            },
          },
          response,
          context,
        );

        response.resetResponseLineForTesting();
        await launchPwa.handler({params: {manifestId}}, response, context);
        assert.ok(
          response.responseLines.some(l => l.includes(startUrl)),
          `launch response should reference the app url, got: ${response.responseLines.join('\n')}`,
        );

        // The launched app window is a real page reachable via the browser,
        // running in standalone display mode.
        const appPage = context.browser
          .targets()
          .find(t => t.url() === startUrl);
        assert.ok(appPage, 'the launched app page should be a browser target');
        const page = await appPage.page();
        assert.ok(page, 'the launched app target should resolve to a Page');
        const isStandalone = await page.evaluate(() => {
          return matchMedia('(display-mode: standalone)').matches;
        });
        assert.strictEqual(
          isStandalone,
          true,
          'the launched app should be in standalone display mode',
        );

        await uninstallPwa.handler({params: {manifestId}}, response, context);
      },
      PWA_BROWSER_OPTIONS,
      {categoryPwa: true},
    );
  });

  it('launches an installed PWA at an explicit URL', async () => {
    const {manifestId, startUrl, explicitUrl} = setupPwaRoutes();
    await withMcpContext(
      async (response, context) => {
        await installPwa.handler(
          {
            params: {
              manifestId,
              installUrlOrBundleUrl: startUrl,
              displayMode: 'standalone',
            },
          },
          response,
          context,
        );

        response.resetResponseLineForTesting();
        await launchPwa.handler(
          {params: {manifestId, url: explicitUrl}},
          response,
          context,
        );
        assert.ok(
          response.responseLines.some(line => {
            return line.includes(explicitUrl);
          }),
          `launch response should reference ${explicitUrl}`,
        );

        const appTarget = context.browser.targets().find(target => {
          return target.url() === explicitUrl;
        });
        assert.ok(appTarget, 'the explicit launch target should exist');

        await uninstallPwa.handler({params: {manifestId}}, response, context);
      },
      PWA_BROWSER_OPTIONS,
      {categoryPwa: true},
    );
  });

  it('selects a surviving page after uninstall closes the selected app', async () => {
    const {manifestId, startUrl} = setupPwaRoutes();
    await withMcpContext(
      async (response, context) => {
        const originalPage = context.getSelectedMcpPage();
        await installPwa.handler(
          {
            params: {
              manifestId,
              installUrlOrBundleUrl: startUrl,
              displayMode: 'standalone',
            },
          },
          response,
          context,
        );
        await launchPwa.handler({params: {manifestId}}, response, context);
        await context.createPagesSnapshot();
        const appPage = context.getPages().find(page => {
          return page.pptrPage.url() === startUrl;
        });
        assert.ok(appPage, 'the launched app page should be listed');
        context.selectPage(appPage);

        response.resetResponseLineForTesting();
        await uninstallPwa.handler({params: {manifestId}}, response, context);
        const result = await response.handle(context);

        assert.strictEqual(context.getSelectedMcpPage(), originalPage);
        assert.match(
          getTextContent(result.content[0]),
          /previously selected page was closed/,
        );
      },
      PWA_BROWSER_OPTIONS,
      {categoryPwa: true},
    );
  });
});
