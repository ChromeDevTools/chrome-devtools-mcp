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
  toSnippet,
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
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPptrPage();
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
        const responseData = await response.handle('list_request', context);
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
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPptrPage();
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
        const responseData = await response.handle('list_request', context);
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
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPptrPage();
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
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });
  });
  describe('network_get_request', () => {
    it('attaches request', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
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
        const page = context.getSelectedPptrPage();
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
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPptrPage();
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
        const responseData = await response.handle('get_request', context);

        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });
  });
  describe('network_to_snippet', () => {
    it('generates a curl snippet for a captured request', async () => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      await withMcpContext(async (response, context) => {
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPptrPage();
        await page.goto(server.getRoute('/one'));
        await toSnippet.handler(
          {
            params: {reqid: 1, format: 'curl'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle('to_snippet', context);
        const text = getTextContent(responseData.content[0]);
        assert.match(text, /curl -X GET/);
        assert.match(text, /\/one/);
      });
    });

    it('generates a fetch snippet for a captured request', async () => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      await withMcpContext(async (response, context) => {
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPptrPage();
        await page.goto(server.getRoute('/one'));
        await toSnippet.handler(
          {
            params: {reqid: 1, format: 'fetch'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle('to_snippet', context);
        const text = getTextContent(responseData.content[0]);
        assert.match(text, /fetch\(/);
        assert.match(text, /"method": "GET"/);
      });
    });

    it('redacts sensitive headers by default and includes them when asked', async () => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      await withMcpContext(async (response, context) => {
        await context.setUpNetworkCollectorForTesting();
        const page = context.getSelectedPptrPage();
        await page.setExtraHTTPHeaders({authorization: 'Bearer secret-token'});
        await page.goto(server.getRoute('/one'));

        await toSnippet.handler(
          {params: {reqid: 1}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        const redacted = getTextContent(
          (await response.handle('to_snippet', context)).content[0],
        );
        assert.doesNotMatch(redacted, /secret-token/);

        await withMcpContext(async (response2, context2) => {
          await context2.setUpNetworkCollectorForTesting();
          const page2 = context2.getSelectedPptrPage();
          await page2.setExtraHTTPHeaders({
            authorization: 'Bearer secret-token',
          });
          await page2.goto(server.getRoute('/one'));
          await toSnippet.handler(
            {
              params: {reqid: 1, includeSensitiveHeaders: true},
              page: context2.getSelectedMcpPage(),
            },
            response2,
            context2,
          );
          const shown = getTextContent(
            (await response2.handle('to_snippet', context2)).content[0],
          );
          assert.match(shown, /Bearer secret-token/);
        });
      });
    });
  });
});
