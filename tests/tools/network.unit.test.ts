/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the network tool handlers.
 *
 * Verifies handler state mutations on McpResponse without a real browser.
 *
 * Part of the test-optimization effort described in
 * https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2639.
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  getNetworkRequest,
  listNetworkRequests,
} from '../../src/tools/network.js';
import {
  createMockMcpContext,
  createMockMcpPage,
  createMockMcpResponse,
} from '../testMocks.js';

afterEach(() => {
  sinon.restore();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: {handler: (...args: any[]) => Promise<void>}, params: Record<string, unknown> = {}) {
  const page = createMockMcpPage();
  // getDevToolsData is called by some network handlers to surface DevTools UI state
  page.getDevToolsData = sinon.stub().resolves({});
  const context = createMockMcpContext({selectedPage: page});
  const response = createMockMcpResponse();
  await tool.handler({params, page}, response, context);
  return {page, context, response};
}

describe('network tool handlers (unit)', () => {
  // -------------------------------------------------------------------------
  // list_network_requests
  // -------------------------------------------------------------------------
  describe('listNetworkRequests handler', () => {
    it('sets includeNetworkRequests to true on the response', async () => {
      const {response} = await run(listNetworkRequests);
      assert.strictEqual(response.setIncludeNetworkRequests.callCount, 1);
      const [value] = response.setIncludeNetworkRequests.firstCall.args as [boolean, unknown];
      assert.strictEqual(value, true);
    });

    it('passes pageSize and pageIdx through to the response', async () => {
      const {response} = await run(listNetworkRequests, {pageSize: 20, pageIdx: 1});
      const [, options] = response.setIncludeNetworkRequests.firstCall.args as [boolean, {pageSize?: number; pageIdx?: number}];
      assert.strictEqual(options.pageSize, 20);
      assert.strictEqual(options.pageIdx, 1);
    });

    it('passes resourceTypes filter through to the response', async () => {
      const {response} = await run(listNetworkRequests, {resourceTypes: ['fetch', 'xhr']});
      const [, options] = response.setIncludeNetworkRequests.firstCall.args as [boolean, {resourceTypes?: string[]}];
      assert.deepStrictEqual(options.resourceTypes, ['fetch', 'xhr']);
    });

    it('passes includePreservedRequests through to the response', async () => {
      const {response} = await run(listNetworkRequests, {includePreservedRequests: true});
      const [, options] = response.setIncludeNetworkRequests.firstCall.args as [boolean, {includePreservedRequests?: boolean}];
      assert.strictEqual(options.includePreservedRequests, true);
    });
  });

  // -------------------------------------------------------------------------
  // get_network_request
  // -------------------------------------------------------------------------
  describe('getNetworkRequest handler', () => {
    it('attaches the network request id when reqid is provided', async () => {
      const {response} = await run(getNetworkRequest, {reqid: 5});
      assert.strictEqual(response.attachNetworkRequest.callCount, 1);
      const [reqid] = response.attachNetworkRequest.firstCall.args as [number, unknown];
      assert.strictEqual(reqid, 5);
    });

    it('forwards requestFilePath and responseFilePath to attachNetworkRequest', async () => {
      const {response} = await run(getNetworkRequest, {
        reqid: 3,
        requestFilePath: '/tmp/req.network-request',
        responseFilePath: '/tmp/res.network-response',
      });
      const [, options] = response.attachNetworkRequest.firstCall.args as [
        number,
        {requestFilePath?: string; responseFilePath?: string},
      ];
      assert.strictEqual(options.requestFilePath, '/tmp/req.network-request');
      assert.strictEqual(options.responseFilePath, '/tmp/res.network-response');
    });
  });
});
