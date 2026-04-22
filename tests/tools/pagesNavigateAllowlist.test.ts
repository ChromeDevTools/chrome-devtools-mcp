/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {navigatePage} from '../../src/tools/pages.js';
import {serverHooks} from '../server.js';
import {withMcpContext} from '../utils.js';

describe('pages allowList', () => {
  const server = serverHooks();
  const args = {experimentalNavigationAllowlist: true} as ParsedArguments;

  it('navigates through redirects when all URLs are allowed', async () => {
    server.addRoute('/a.html', (_req, res) => {
      res.writeHead(302, {Location: '/b.html'});
      res.end();
    });
    server.addRoute('/b.html', (_req, res) => {
      res.writeHead(302, {Location: '/c.html'});
      res.end();
    });
    server.addHtmlRoute(
      '/c.html',
      '<html><body><h1>Final Destination</h1></body></html>',
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      const baseUrl = server.baseUrl;
      const allowList = `${baseUrl}/a.html,${baseUrl}/b.html,${baseUrl}/c.html`;

      await navigatePage(args).handler(
        {
          params: {
            url: `${baseUrl}/a.html`,
            allowList,
          },
          page,
        },
        response,
        context,
      );

      assert.strictEqual(page.pptrPage.url(), `${baseUrl}/c.html`);
      const content = await page.pptrPage.evaluate(
        () => document.querySelector('h1')?.textContent,
      );
      assert.strictEqual(content, 'Final Destination');
    });
  });

  it('blocks navigation when a redirect target is not allowed', async () => {
    server.addRoute('/a.html', (_req, res) => {
      res.writeHead(302, {Location: '/b.html'});
      res.end();
    });
    server.addRoute('/b.html', (_req, res) => {
      res.writeHead(302, {Location: '/c.html'});
      res.end();
    });
    server.addHtmlRoute(
      '/c.html',
      '<html><body><h1>Final Destination</h1></body></html>',
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      const baseUrl = server.baseUrl;
      // b.html is missing from allowList
      const allowList = `${baseUrl}/a.html,${baseUrl}/c.html`;

      await navigatePage(args).handler(
        {
          params: {
            url: `${baseUrl}/a.html`,
            allowList,
            timeout: 2000, // Short timeout for failure
          },
          page,
        },
        response,
        context,
      );

      // The navigation to b.html should be blocked.
      // Puppeteer's goto will likely throw a timeout or net::ERR_ABORTED error.
      const url = page.pptrPage.url();
      assert.notStrictEqual(url, `${baseUrl}/c.html`);
      assert.ok(
        response.responseLines.some(line =>
          line.includes('Unable to navigate'),
        ),
      );
    });
  });
});
