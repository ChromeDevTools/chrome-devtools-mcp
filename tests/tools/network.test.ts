/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  getNetworkRequest,
  listNetworkRequests,
} from '../../src/tools/network.js';
import {serverHooks} from '../server.js';
import {html, withBrowser, stabilizeResponseOutput} from '../utils.js';

describe('network', () => {
  const server = serverHooks();
  describe('network_list_requests', () => {
    it('list requests', async () => {
      await withBrowser(async (response, context) => {
        await listNetworkRequests.handler({params: {}}, response, context);
        assert.ok(response.includeNetworkRequests);
        assert.strictEqual(response.networkRequestsPageIdx, undefined);
      });
    });

    it('list requests form current navigations only', async t => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      server.addHtmlRoute('/two', html`<main>Second</main>`);
      server.addHtmlRoute('/three', html`<main>Third</main>`);

      await withBrowser(async (response, context) => {
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await listNetworkRequests.handler(
          {
            params: {},
          },
          response,
          context,
        );
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot?.(stabilizeResponseOutput(responseData[0].text));
      });
    });

    it('list requests from previous navigations', async t => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      server.addHtmlRoute('/two', html`<main>Second</main>`);
      server.addHtmlRoute('/three', html`<main>Third</main>`);

      await withBrowser(async (response, context) => {
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await listNetworkRequests.handler(
          {
            params: {
              includePreviousNavigations: true,
            },
          },
          response,
          context,
        );
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot?.(stabilizeResponseOutput(responseData[0].text));
      });
    });

    it('list requests from previous navigations from redirects', async t => {
      server.addRoute('/redirect', async (_req, res) => {
        res.writeHead(302, {
          Location: server.getRoute('/redirected'),
        });
        res.end();
      });

      server.addHtmlRoute(
        '/redirected',
        html`<script>
          document.location.href = '/redirected-page';
        </script>`,
      );

      server.addHtmlRoute(
        '/redirected-page',
        html`<main>I was redirected 2 times</main>`,
      );

      await withBrowser(async (response, context) => {
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/redirect'));
        await listNetworkRequests.handler(
          {
            params: {
              includePreviousNavigations: true,
            },
          },
          response,
          context,
        );
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot?.(stabilizeResponseOutput(responseData[0].text));
      });
    });
  });
  describe('network_get_request', () => {
    it('attaches request', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {reqid: 1}},
          response,
          context,
        );

        assert.equal(response.attachedNetworkRequestId, 1);
      });
    });
    it('should not add the request list', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {reqid: 1}},
          response,
          context,
        );
        assert(!response.includeNetworkRequests);
      });
    });
    it('should get request from previous navigations', async t => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      server.addHtmlRoute('/two', html`<main>Second</main>`);
      server.addHtmlRoute('/three', html`<main>Third</main>`);

      await withBrowser(async (response, context) => {
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await getNetworkRequest.handler(
          {
            params: {
              reqid: 1,
            },
          },
          response,
          context,
        );
        const responseData = await response.handle('get_request', context);

        t.assert.snapshot?.(stabilizeResponseOutput(responseData[0].text));
      });
    });
  });
});
