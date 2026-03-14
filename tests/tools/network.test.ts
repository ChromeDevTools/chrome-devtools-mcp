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
  setExtraHTTPHeaders,
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
        t.assert.snapshot?.(
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
        t.assert.snapshot?.(
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
        t.assert.snapshot?.(
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

        t.assert.snapshot?.(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });
  });

  describe('set_extra_http_headers', () => {
    it('sets extra headers on requests', async () => {
      let receivedHeaders: Record<string, string> = {};
      server.addRoute('/headers-test', async (req, res) => {
        receivedHeaders = req.headers as Record<string, string>;
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<main>Headers Test</main>');
      });

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await setExtraHTTPHeaders.handler(
          {
            params: {headers: {'X-Custom-Header': 'test-value'}},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(
          response.responseLines[0]?.includes('1 extra HTTP header'),
        );

        await page.goto(server.getRoute('/headers-test'));
        assert.strictEqual(receivedHeaders['x-custom-header'], 'test-value');
      });
    });

    it('clears extra headers when empty object is passed', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        // Set headers first.
        await page.setExtraHTTPHeaders({'X-To-Clear': 'value'});

        await setExtraHTTPHeaders.handler(
          {
            params: {headers: {}},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(response.responseLines[0]?.includes('cleared'));
      });
    });

    it('headers persist across navigations', async () => {
      const receivedHeaders: Array<Record<string, string>> = [];
      server.addRoute('/persist-one', async (req, res) => {
        receivedHeaders.push({...req.headers} as Record<string, string>);
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<main>Page One</main>');
      });
      server.addRoute('/persist-two', async (req, res) => {
        receivedHeaders.push({...req.headers} as Record<string, string>);
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<main>Page Two</main>');
      });

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await setExtraHTTPHeaders.handler(
          {
            params: {headers: {'X-Persist': 'yes'}},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        await page.goto(server.getRoute('/persist-one'));
        await page.goto(server.getRoute('/persist-two'));

        assert.strictEqual(receivedHeaders[0]?.['x-persist'], 'yes');
        assert.strictEqual(receivedHeaders[1]?.['x-persist'], 'yes');
      });
    });
  });
});
