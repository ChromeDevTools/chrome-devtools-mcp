/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {NetworkOverridesFormatter} from '../../src/formatters/NetworkOverridesFormatter.js';
import {
  mockNetwork,
  removeNetworkMock,
  getNetworkRequest,
  listNetworkRequests,
} from '../../src/tools/network.js';
import {createHandlerMocks, createMockParsedArguments} from '../mocks.js';

describe('network', () => {
  describe('network mocks', () => {
    it('rejects relative and empty routes with an actionable warning', () => {
      const schema = mockNetwork(createMockParsedArguments()).schema.route;
      for (const route of ['/app.js*', '   ']) {
        assert.strictEqual(schema.safeParse(route).success, false);
      }
      assert.throws(() => schema.parse('/app.js*'), /absolute URLPattern/);
      assert.strictEqual(schema.parse('  *://*:*/app.js  '), '*://*:*/app.js');
    });

    it('rejects regex and named groups in routes for inspection, updates and removal', () => {
      const args = createMockParsedArguments();
      for (const tool of [mockNetwork(args), removeNetworkMock(args)]) {
        for (const route of [
          'https://example.com/(app|other).js',
          'https://example.com/:name.js',
          'https://:host/app.js',
          'https://example.com/app.js?version=:version',
        ]) {
          assert.throws(() => tool.schema.route.parse(route), /group/);
        }
      }
    });

    for (const params of [
      {body: ' '},
      {route: '/app.js*', body: './app.js'},
      {route: '*app.js*', body: './app.js'},
      {route: 'https://example.com/:file', body: './app.js'},
      {route: 'https://example.com/(app|other).js', body: './app.js'},
      {resourceType: 'websocket', body: './app.js'},
    ]) {
      it(
        'rejects invalid mock parameters before any state change: ' +
          JSON.stringify(params),
        async () => {
          const {page, context, response, args} = createHandlerMocks();
          await assert.rejects(
            mockNetwork(args).handler({params, page}, response, context),
          );
          sinon.assert.notCalled(context.validatePath);
          sinon.assert.notCalled(page.mockNetwork);
          sinon.assert.notCalled(page.listNetworkMocks);
          sinon.assert.notCalled(response.appendResponseLine);
        },
      );
    }

    it('revalidates the canonical body file before each read', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.validatePath.resolves('/tmp/script.js');
      page.mockNetwork.resolves({
        id: 1,
        kind: 'file',
        urlPattern: '*://*:*/*',
        responseFilePath: '/tmp/script.js',
        contentType: 'application/javascript; charset=utf-8',
        diagnostics: {hits: 0, errors: 0, navigations: 0},
      });
      const readFile = sinon
        .stub(fs, 'readFile')
        .resolves(Buffer.from('updated'));
      await mockNetwork(args).handler(
        {params: {body: '/tmp/script.js'}, page},
        response,
        context,
      );
      const input = page.mockNetwork.firstCall.args[0];
      assert.ok(input.kind === 'file');
      sinon.assert.calledOnceWithExactly(page.mockNetwork, {
        kind: 'file',
        urlPattern: undefined,
        resourceType: undefined,
        responseFilePath: '/tmp/script.js',
        loadResponseFile: input.loadResponseFile,
      });
      sinon.assert.notCalled(context.validatePath);
      sinon.assert.notCalled(readFile);
      assert.deepStrictEqual(
        await input.loadResponseFile(),
        Buffer.from('updated'),
      );
      sinon.assert.calledOnceWithExactly(
        context.validatePath,
        '/tmp/script.js',
      );
      sinon.assert.calledOnceWithMatch(
        readFile,
        sinon.match.same('/tmp/script.js'),
      );
      context.validatePath.rejects(new Error('Access denied'));
      readFile.resetHistory();
      await assert.rejects(input.loadResponseFile(), /Access denied/);
      sinon.assert.notCalled(readFile);
    });

    for (const params of [
      {},
      {route: '*://*:*/app.js'},
      {resourceType: 'script'},
      {route: '*://*:*/app.js', resourceType: 'script'},
    ] satisfies Array<{route?: string; resourceType?: 'script'}>) {
      it(
        'inspects supplied filters without changing mocks: ' +
          JSON.stringify(params),
        async () => {
          const {page, context, response, args} = createHandlerMocks();
          page.listNetworkMocks.returns([]);
          await mockNetwork(args).handler({params, page}, response, context);
          sinon.assert.calledOnceWithExactly(page.listNetworkMocks, {
            urlPattern: params.route,
            resourceType: params.resourceType,
          });
          sinon.assert.notCalled(page.mockNetwork);
          sinon.assert.calledOnceWithExactly(
            response.appendResponseLine,
            'No network mocks match these filters.',
          );
        },
      );
    }

    it('formats hit counts, unmatched warnings and replacement errors when inspecting', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.listNetworkMocks.returns([
        {
          id: 1,
          diagnostics: {
            hits: 2,
            errors: 1,
            navigations: 1,
            lastError: 'File missing',
          },
          kind: 'file',
          urlPattern: '*://*:*/*.js',
          resourceType: 'script',
          responseFilePath: '/tmp/script.js',
          contentType: 'text/javascript',
        },
        {
          id: 2,
          diagnostics: {hits: 0, errors: 0, navigations: 1},
          kind: 'file',
          urlPattern: 'https://example.com/missing.js',
          responseFilePath: '/tmp/replacement.js',
          contentType: 'text/javascript',
        },
      ]);
      await mockNetwork(args).handler({params: {}, page}, response, context);
      sinon.assert.calledOnceWithExactly(page.listNetworkMocks, {
        urlPattern: undefined,
        resourceType: undefined,
      });
      sinon.assert.notCalled(page.mockNetwork);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        new NetworkOverridesFormatter(
          page.listNetworkMocks.firstCall.returnValue,
        ).toString(),
      );
    });
  });

  describe('remove_network_mock', () => {
    for (const params of [
      {},
      {route: '*://*:*/app.js'},
      {resourceType: 'script'},
      {route: '*://*:*/app.js', resourceType: 'script'},
    ] satisfies Array<{route?: string; resourceType?: 'script'}>) {
      it('removes supplied filters: ' + JSON.stringify(params), async () => {
        const {page, context, response, args} = createHandlerMocks();
        page.removeNetworkMocks.resolves(2);
        await removeNetworkMock(args).handler(
          {params, page},
          response,
          context,
        );
        sinon.assert.calledOnceWithExactly(page.removeNetworkMocks, {
          urlPattern: params.route,
          resourceType: params.resourceType,
        });
        sinon.assert.notCalled(page.mockNetwork);
        sinon.assert.calledOnceWithExactly(
          response.appendResponseLine,
          'Removed 2 network mocks.',
        );
      });
    }

    it('reports when no mock matched for removal', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.removeNetworkMocks.resolves(0);
      await removeNetworkMock(args).handler(
        {params: {route: '*://*:*/*'}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.removeNetworkMocks, {
        urlPattern: '*://*:*/*',
        resourceType: undefined,
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Removed 0 network mocks.',
      );
    });

    it('propagates removal failure without reporting success', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.removeNetworkMocks.rejects(
        new Error('Cannot change mocks during a trace'),
      );
      await assert.rejects(
        removeNetworkMock(args).handler({params: {}, page}, response, context),
        /during a trace/,
      );
      sinon.assert.notCalled(response.appendResponseLine);
    });
  });

  describe('list_network_requests', () => {
    it('describes the default preserved navigation history', () => {
      const tool = listNetworkRequests(createMockParsedArguments());
      assert.strictEqual(
        tool.schema.includePreservedRequests.description,
        'Set to true to return the preserved requests over the last 3 navigations.',
      );
    });

    it('describes preserved requests using maxNavigationSaved', () => {
      const tool = listNetworkRequests(
        createMockParsedArguments({maxNavigationSaved: 5}),
      );
      assert.strictEqual(
        tool.schema.includePreservedRequests.description,
        'Set to true to return the preserved requests over the last 5 navigations.',
      );
    });

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
