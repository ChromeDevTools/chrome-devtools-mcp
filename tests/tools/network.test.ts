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

    it('lists the initial navigation request of pages opened via window.open', async () => {
      server.addHtmlRoute('/opener', html`<main>Opener</main>`);
      server.addRoute('/popup-redirect', (_req, res) => {
        // Delay the redirect a bit so that the redirect chain is still in
        // flight while the popup's McpPage is being wired up.
        setTimeout(() => {
          res.writeHead(302, {
            Location: server.getRoute('/popup'),
          });
          res.end();
        }, 250);
      });
      server.addHtmlRoute('/popup', html`<main>Popup</main>`);

      await withMcpContext(async (response, context) => {
        const openerPage = context.getSelectedMcpPage().pptrPage;
        await openerPage.goto(server.getRoute('/opener'));

        await openerPage.evaluate(url => {
          window.open(url, '_blank');
        }, server.getRoute('/popup-redirect'));

        // The popup's McpPage is created asynchronously via targetcreated.
        const popupUrl = server.getRoute('/popup');
        const deadline = Date.now() + 10_000;
        let popupMcpPage;
        while (!popupMcpPage && Date.now() < deadline) {
          popupMcpPage = context
            .getPages()
            .find(page => page.pptrPage.url() === popupUrl);
          if (!popupMcpPage) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        assert.ok(popupMcpPage, 'Popup page was not reported');

        context.selectPage(popupMcpPage);
        response.setPage(popupMcpPage);
        await listNetworkRequests.handler(
          {params: {}, page: popupMcpPage},
          response,
          context,
        );
        const responseData = await response.handle(context);
        const text = getTextContent(responseData.content[0]);
        assert.ok(
          text.includes(server.getRoute('/popup-redirect')),
          `Expected the popup's initial navigation request to be listed:\n${text}`,
        );
        assert.ok(
          text.includes(popupUrl),
          `Expected the popup's redirect target to be listed:\n${text}`,
        );
      });
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
