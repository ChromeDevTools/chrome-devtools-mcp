/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {rm, writeFile} from 'node:fs/promises';
import type {IncomingHttpHeaders} from 'node:http';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import {
  addNetworkOverride,
  removeNetworkOverride,
} from '../src/tools/network.js';
import {serverHooks} from './server.js';
import {createTempDir, html, withMcpContext} from './utils.js';

describe('network overrides integration', () => {
  const server = serverHooks();

  function addJavaScriptRoute(
    routePath: string,
    source: string,
    onRequest?: () => void,
  ): void {
    server.addRoute(routePath, (_req, res) => {
      onRequest?.();
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.statusCode = 200;
      res.end(source);
    });
  }

  it('redirects matching requests across reloads until removed', async () => {
    let originalRequests = 0;
    let replacementRequests = 0;
    addJavaScriptRoute(
      '/redirect-original.js',
      "document.documentElement.dataset.overrideSource = 'original';",
      () => {
        originalRequests++;
      },
    );
    addJavaScriptRoute(
      '/redirect-replacement.js',
      "document.documentElement.dataset.overrideSource = 'replacement';",
      () => {
        replacementRequests++;
      },
    );
    server.addHtmlRoute(
      '/redirect-page',
      html`<script src="${server.getRoute('/redirect-original.js')}"></script>`,
    );

    await withMcpContext(async (response, context, args) => {
      const mcpPage = context.getSelectedMcpPage();
      const page = mcpPage.pptrPage;
      await addNetworkOverride(args).handler(
        {
          params: {
            urlPattern: server.getRoute('/redirect-original.js'),
            redirectUrl: server.getRoute('/redirect-replacement.js'),
          },
          page: mcpPage,
        },
        response,
        context,
      );
      assert.deepStrictEqual(response.responseLines, [
        'Added network override 1. Reload or navigate the page to apply it.',
      ]);

      await page.goto(server.getRoute('/redirect-page'));
      assert.strictEqual(
        await page.evaluate(
          () => document.documentElement.dataset.overrideSource,
        ),
        'replacement',
      );

      await page.reload();
      assert.strictEqual(
        await page.evaluate(
          () => document.documentElement.dataset.overrideSource,
        ),
        'replacement',
      );
      assert.strictEqual(originalRequests, 0);
      assert.strictEqual(replacementRequests, 2);

      response.resetResponseLineForTesting();
      await removeNetworkOverride(args).handler(
        {params: {id: 1}, page: mcpPage},
        response,
        context,
      );
      await page.reload();
      assert.strictEqual(
        await page.evaluate(
          () => document.documentElement.dataset.overrideSource,
        ),
        'original',
      );
      assert.strictEqual(originalRequests, 1);
    });
  });

  it('sanitizes cross-origin headers while preserving Origin', async t => {
    let replacementHeaders: IncomingHttpHeaders = {};
    server.addHtmlRoute('/cross-origin-setup', html`<main>Setup</main>`);
    addJavaScriptRoute(
      '/cross-origin-original.js',
      "document.documentElement.dataset.overrideSource = 'original';",
    );
    server.addHtmlRoute(
      '/cross-origin-page',
      html`<script src="${server.getRoute('/cross-origin-original.js')}"></script>`,
    );
    server.addRoute('/cross-origin-replacement.js', (req, res) => {
      replacementHeaders = req.headers;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.statusCode = 200;
      res.end(
        "document.documentElement.dataset.overrideSource = 'replacement';",
      );
    });

    await withMcpContext(async (response, context, args) => {
      const mcpPage = context.getSelectedMcpPage();
      const page = mcpPage.pptrPage;
      const browserContext = page.browserContext();
      t.after(async () => {
        await browserContext.deleteMatchingCookies({
          name: 'override_secret',
          domain: new URL(server.baseUrl).hostname,
        });
      });
      await page.goto(server.getRoute('/cross-origin-setup'));
      await page.evaluate(() => {
        document.cookie = 'override_secret=cookie; path=/';
      });
      await page.setExtraHTTPHeaders({
        Authorization: 'Bearer secret',
        Origin: server.baseUrl,
        'X-Api-Key': 'secret',
      });

      const replacementUrl =
        server.baseUrl.replace('127.0.0.1', 'localhost') +
        '/cross-origin-replacement.js';
      await addNetworkOverride(args).handler(
        {
          params: {
            urlPattern: server.getRoute('/cross-origin-original.js'),
            resourceType: 'script',
            redirectUrl: replacementUrl,
          },
          page: mcpPage,
        },
        response,
        context,
      );

      await page.goto(server.getRoute('/cross-origin-page'));
      assert.strictEqual(
        await page.evaluate(
          () => document.documentElement.dataset.overrideSource,
        ),
        'replacement',
      );
      assert.strictEqual(replacementHeaders.origin, server.baseUrl);
      assert.strictEqual(replacementHeaders.authorization, undefined);
      assert.strictEqual(replacementHeaders.cookie, undefined);
      assert.strictEqual(replacementHeaders.referer, undefined);
      assert.strictEqual(replacementHeaders['x-api-key'], undefined);

      response.resetResponseLineForTesting();
      await removeNetworkOverride(args).handler(
        {params: {id: 1}, page: mcpPage},
        response,
        context,
      );
    });
  });

  it('serves the latest contents of a local file', async () => {
    using directory = createTempDir('network-override-');
    const filePath = join(directory.path, 'local-override.js');
    await writeFile(
      filePath,
      "document.documentElement.dataset.overrideSource = 'caffè-☕';",
    );
    addJavaScriptRoute(
      '/local-original.js',
      "document.documentElement.dataset.overrideSource = 'original';",
    );
    server.addHtmlRoute(
      '/local-page',
      html`<script src="${server.getRoute('/local-original.js')}"></script>`,
    );

    await withMcpContext(async (response, context, args) => {
      const mcpPage = context.getSelectedMcpPage();
      const page = mcpPage.pptrPage;
      await addNetworkOverride(args).handler(
        {
          params: {
            urlPattern: server.getRoute('/local-original.js'),
            responseFilePath: filePath,
          },
          page: mcpPage,
        },
        response,
        context,
      );

      await page.goto(server.getRoute('/local-page'));
      assert.strictEqual(
        await page.evaluate(
          () => document.documentElement.dataset.overrideSource,
        ),
        'caffè-☕',
      );

      await writeFile(
        filePath,
        "document.documentElement.dataset.overrideSource = 'rebuilt';",
      );
      await page.reload();
      assert.strictEqual(
        await page.evaluate(
          () => document.documentElement.dataset.overrideSource,
        ),
        'rebuilt',
      );

      response.resetResponseLineForTesting();
      await removeNetworkOverride(args).handler(
        {params: {id: 1}, page: mcpPage},
        response,
        context,
      );
    });
  });

  it('matches cache-busting query strings with a wildcard', async () => {
    let originalRequests = 0;
    addJavaScriptRoute(
      '/query-original.js?v=42',
      "document.documentElement.dataset.overrideSource = 'original';",
      () => {
        originalRequests++;
      },
    );
    addJavaScriptRoute(
      '/query-replacement.js',
      "document.documentElement.dataset.overrideSource = 'replacement';",
    );
    server.addHtmlRoute(
      '/query-page',
      html`<script src="${server.getRoute('/query-original.js?v=42')}"></script>`,
    );

    await withMcpContext(async (response, context, args) => {
      const mcpPage = context.getSelectedMcpPage();
      const page = mcpPage.pptrPage;
      await addNetworkOverride(args).handler(
        {
          params: {
            urlPattern: server.baseUrl + '/query-original.js*',
            redirectUrl: server.getRoute('/query-replacement.js'),
          },
          page: mcpPage,
        },
        response,
        context,
      );

      await page.goto(server.getRoute('/query-page'));
      assert.strictEqual(
        await page.evaluate(
          () => document.documentElement.dataset.overrideSource,
        ),
        'replacement',
      );
      assert.strictEqual(originalRequests, 0);

      response.resetResponseLineForTesting();
      await removeNetworkOverride(args).handler(
        {params: {id: 1}, page: mcpPage},
        response,
        context,
      );
    });
  });

  it('aborts the request when a local file disappears', async () => {
    using directory = createTempDir('network-override-');
    const filePath = join(directory.path, 'removed-override.js');
    let originalRequests = 0;
    await writeFile(
      filePath,
      "document.documentElement.dataset.overrideSource = 'local';",
    );
    addJavaScriptRoute(
      '/fallback-original.js',
      "document.documentElement.dataset.overrideSource = 'original';",
      () => {
        originalRequests++;
      },
    );
    server.addHtmlRoute(
      '/fallback-page',
      html`<script src="${server.getRoute('/fallback-original.js')}"></script>`,
    );

    await withMcpContext(async (response, context, args) => {
      const mcpPage = context.getSelectedMcpPage();
      const page = mcpPage.pptrPage;
      await addNetworkOverride(args).handler(
        {
          params: {
            urlPattern: server.getRoute('/fallback-original.js'),
            responseFilePath: filePath,
          },
          page: mcpPage,
        },
        response,
        context,
      );

      await rm(filePath);
      await page.goto(server.getRoute('/fallback-page'), {
        waitUntil: 'load',
        timeout: 5_000,
      });
      assert.strictEqual(
        await page.evaluate(
          () => document.documentElement.dataset.overrideSource,
        ),
        undefined,
      );
      assert.strictEqual(originalRequests, 0);

      response.resetResponseLineForTesting();
      await removeNetworkOverride(args).handler(
        {params: {id: 1}, page: mcpPage},
        response,
        context,
      );
    });
  });
});
