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
import {withBrowser} from '../utils.js';

describe('network', () => {
  describe('network_list_requests', () => {
    it('list requests', async () => {
      await withBrowser(async (response, context) => {
        await listNetworkRequests.handler({params: {}}, response, context);
        assert.ok(response.includeNetworkRequests);
        assert.strictEqual(response.networkRequestsPageIdx, undefined);
      });
    });

    it('list requests form current navigations only', async t => {
      await withBrowser(async (response, context) => {
        const page = await context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello 1</div>');
        await page.goto('data:text/html,<div>Hello 2</div>');
        await page.goto('data:text/html,<div>Hello 3</div>');
        await listNetworkRequests.handler(
          {
            params: {},
          },
          response,
          context,
        );
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot?.(responseData[0].text);
      });
    });

    it.only('list requests from previous navigations', async t => {
      await withBrowser(async (response, context) => {
        const page = await context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello 1</div>');
        await page.goto('data:text/html,<div>Hello 2</div>');
        console.log('Last navigtation');
        await page.goto('data:text/html,<div>Hello 3</div>');
        await listNetworkRequests.handler(
          {
            params: {
              includePreviousNavigations: 1,
            },
          },
          response,
          context,
        );
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot?.(responseData[0].text);
      });
    });
  });
  describe('network_get_request', () => {
    it('attaches request', async () => {
      await withBrowser(async (response, context) => {
        const page = await context.getSelectedPage();
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
        const page = await context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {reqid: 1}},
          response,
          context,
        );
        assert(!response.includeNetworkRequests);
      });
    });
  });
});
