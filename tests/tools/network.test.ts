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
import {
  getTextContent,
  html,
  stabilizeResponseOutput,
  withMcpContext,
} from '../utils.js';

describe('network', () => {
  const server = serverHooks();
  describe('network_list_requests', () => {
    it('list requests', async () => {
      await withMcpContext(async (response, context) => {
        await listNetworkRequests.handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.ok(response.includeNetworkRequests);
        assert.strictEqual(response.networkRequestsPageIdx, undefined);
      });
    });

    it('list requests form current navigations only', async t => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      server.addHtmlRoute('/two', html`<main>Second</main>`);
      server.addHtmlRoute('/three', html`<main>Third</main>`);

      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().setUpNetworkCollectorForTesting();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await listNetworkRequests.handler(
          {
            params: {},

            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle(context);
        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });

    it('list requests from previous navigations', async t => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      server.addHtmlRoute('/two', html`<main>Second</main>`);
      server.addHtmlRoute('/three', html`<main>Third</main>`);

      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().setUpNetworkCollectorForTesting();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await listNetworkRequests.handler(
          {
            params: {
              includePreservedRequests: true,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle(context);
        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
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

      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().setUpNetworkCollectorForTesting();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/redirect'), {
          waitUntil: 'networkidle0',
        });
        await listNetworkRequests.handler(
          {
            params: {
              includePreservedRequests: true,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle(context);
        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });
  });

  it('captures navigation request in window.open popup', async () => {
    server.addHtmlRoute(
      '/opener',
      html`<script>
        window.open('/popup-page', '_blank');
      </script>`,
    );
    server.addHtmlRoute('/popup-page', html`<main>Popup</main>`);

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;

      const popupTargetPromise = context.browser.waitForTarget(
        t => t.type() === 'page' && t.url().includes('/popup-page'),
        {timeout: 10000},
      );

      await page.goto(server.getRoute('/opener'), {
        waitUntil: 'networkidle0',
      });

      await popupTargetPromise;

      // Allow #onTargetCreated (fire-and-forget) to complete and register
      // the popup's McpPage in the context.
      await context.createPagesSnapshot();

      const popupMcpPage = context
        .getPages()
        .find(p => p.pptrPage.url().includes('/popup-page'));

      assert.ok(
        popupMcpPage,
        'popup McpPage should be registered in the context',
      );

      // Point the response at the popup page so network data comes from it.
      response.setPage(popupMcpPage);

      await listNetworkRequests.handler(
        {params: {}, page: popupMcpPage},
        response,
        context,
      );

      const responseData = await response.handle(context);
      const text = getTextContent(responseData.content[0]);

      assert.ok(
        text.includes('/popup-page'),
        `Navigation request for /popup-page should be captured; got:\n${text}`,
      );
    });
  });

  describe('network_get_request', () => {
    it('attaches request', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {reqid: 1}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.equal(response.attachedNetworkRequestId, 1);
      });
    });
    it('should not add the request list', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {reqid: 1}, page: context.getSelectedMcpPage()},
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

      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().setUpNetworkCollectorForTesting();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await getNetworkRequest.handler(
          {
            params: {
              reqid: 1,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle(context);

        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });
  });
});
