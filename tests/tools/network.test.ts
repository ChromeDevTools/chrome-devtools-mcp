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
  });
  describe('network_get_request', () => {
    it('attaches request', async () => {
      await withBrowser(async (response, context) => {
        const page = await context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {url: 'data:text/html,<div>Hello MCP</div>'}},
          response,
          context,
        );
        assert.equal(
          response.attachedNetworkRequestUrl,
          'data:text/html,<div>Hello MCP</div>',
        );
      });
    });
    it('should not add the request list', async () => {
      await withBrowser(async (response, context) => {
        const page = await context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {url: 'data:text/html,<div>Hello MCP</div>'}},
          response,
          context,
        );
        assert(!response.includeNetworkRequests);
      });
    });
  });
});
