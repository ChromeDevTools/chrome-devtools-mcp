/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import {mockNetwork, removeNetworkMock} from '../src/tools/network.js';
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

  it('serves the latest contents of a local file when the URL has a query string', async () => {
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
      html`<script src="${server.getRoute('/local-original.js')}?v=1"></script>`,
    );

    await withMcpContext(async (response, context, args) => {
      const mcpPage = context.getSelectedMcpPage();
      const page = mcpPage.pptrPage;
      await mockNetwork(args).handler(
        {
          params: {
            route: server.getRoute('/local-original.js'),
            body: filePath,
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
      await removeNetworkMock(args).handler(
        {params: {}, page: mcpPage},
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
      await mockNetwork(args).handler(
        {
          params: {
            route: server.getRoute('/fallback-original.js'),
            body: filePath,
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
      await removeNetworkMock(args).handler(
        {params: {}, page: mcpPage},
        response,
        context,
      );
    });
  });
});
