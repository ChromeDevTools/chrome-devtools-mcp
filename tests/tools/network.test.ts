/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  getNetworkRequest,
  listNetworkRequests,
} from '../../src/tools/network.js';
import {createHandlerMocks} from '../mocks.js';

describe('network', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('list_network_requests', () => {
    it('handles default parameters', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.getDevToolsData.resolves({});

      await listNetworkRequests(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsData);
      sinon.assert.calledOnceWithExactly(response.attachDevToolsData, {});
      sinon.assert.calledOnceWithExactly(
        response.setIncludeNetworkRequests,
        true,
        {
          pageSize: undefined,
          pageIdx: undefined,
          resourceTypes: undefined,
          includePreservedRequests: undefined,
          networkRequestIdInDevToolsUI: undefined,
        },
      );
    });

    it('passes custom filters and pagination options', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.getDevToolsData.resolves({});

      await listNetworkRequests(args).handler(
        {
          params: {
            pageSize: 25,
            pageIdx: 1,
            resourceTypes: ['xhr', 'fetch'],
            includePreservedRequests: true,
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        response.setIncludeNetworkRequests,
        true,
        {
          pageSize: 25,
          pageIdx: 1,
          resourceTypes: ['xhr', 'fetch'],
          includePreservedRequests: true,
          networkRequestIdInDevToolsUI: undefined,
        },
      );
    });

    it('resolves cdpRequestId from DevTools data when present', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const devToolsData = {
        cdpRequestId: 'req-cdp-123',
      };
      page.getDevToolsData.resolves(devToolsData);
      page.resolveCdpRequestId.withArgs('req-cdp-123').returns(42);

      await listNetworkRequests(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        response.attachDevToolsData,
        devToolsData,
      );
      sinon.assert.calledOnceWithExactly(
        page.resolveCdpRequestId,
        'req-cdp-123',
      );
      sinon.assert.calledOnceWithExactly(
        response.setIncludeNetworkRequests,
        true,
        {
          pageSize: undefined,
          pageIdx: undefined,
          resourceTypes: undefined,
          includePreservedRequests: undefined,
          networkRequestIdInDevToolsUI: 42,
        },
      );
    });
  });

  describe('get_network_request', () => {
    it('attaches request with explicit reqid', async () => {
      const {page, context, response, args} = createHandlerMocks();

      await getNetworkRequest(args).handler(
        {params: {reqid: 10}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(response.attachNetworkRequest, 10, {
        requestFilePath: undefined,
        responseFilePath: undefined,
      });
      sinon.assert.notCalled(page.getDevToolsData);
    });

    it('forwards requestFilePath and responseFilePath when reqid is provided', async () => {
      const {page, context, response, args} = createHandlerMocks();

      await getNetworkRequest(args).handler(
        {
          params: {
            reqid: 10,
            requestFilePath: '/path/req.txt',
            responseFilePath: '/path/res.txt',
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(response.attachNetworkRequest, 10, {
        requestFilePath: '/path/req.txt',
        responseFilePath: '/path/res.txt',
      });
    });

    it('falls back to DevTools selected request when reqid is omitted', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const devToolsData = {
        cdpRequestId: 'req-cdp-selected',
      };
      page.getDevToolsData.resolves(devToolsData);
      page.resolveCdpRequestId.withArgs('req-cdp-selected').returns(99);

      await getNetworkRequest(args).handler(
        {
          params: {
            requestFilePath: '/path/req.txt',
            responseFilePath: '/path/res.txt',
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsData);
      sinon.assert.calledOnceWithExactly(
        response.attachDevToolsData,
        devToolsData,
      );
      sinon.assert.calledOnceWithExactly(
        page.resolveCdpRequestId,
        'req-cdp-selected',
      );
      sinon.assert.calledOnceWithExactly(response.attachNetworkRequest, 99, {
        requestFilePath: '/path/req.txt',
        responseFilePath: '/path/res.txt',
      });
    });

    it('appends message when reqid is omitted and nothing is selected in DevTools', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.getDevToolsData.resolves({});

      await getNetworkRequest(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsData);
      sinon.assert.calledOnceWithExactly(response.attachDevToolsData, {});
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Nothing is currently selected in the DevTools Network panel.',
      );
      sinon.assert.notCalled(response.attachNetworkRequest);
    });

    it('appends message when DevTools data exists but cdpRequestId cannot be resolved', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.getDevToolsData.resolves({cdpRequestId: 'unknown-cdp-id'});
      page.resolveCdpRequestId.withArgs('unknown-cdp-id').returns(undefined);

      await getNetworkRequest(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        page.resolveCdpRequestId,
        'unknown-cdp-id',
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Nothing is currently selected in the DevTools Network panel.',
      );
      sinon.assert.notCalled(response.attachNetworkRequest);
    });
  });
});
