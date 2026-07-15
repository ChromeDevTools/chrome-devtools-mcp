/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import type {NetworkOverride} from '../../src/NetworkOverrideManager.js';
import {
  addNetworkOverride,
  getNetworkRequest,
  listNetworkOverrides,
  listNetworkRequests,
  removeNetworkOverride,
} from '../../src/tools/network.js';
import {createHandlerMocks, createMockParsedArguments} from '../mocks.js';

describe('network', () => {
  // eslint-disable-next-line @local/no-sinon-restore-in-hooks
  afterEach(() => sinon.restore());

  describe('network overrides', () => {
    for (const params of [
      {urlPattern: 'https://example.com/script.js'},
      {
        urlPattern: 'https://example.com/script.js',
        redirectUrl: 'https://example.com/replacement.js',
        responseFilePath: '/tmp/replacement.js',
      },
    ]) {
      it(`rejects ${'redirectUrl' in params ? 'two' : 'no'} replacement sources`, async () => {
        const {page, context, response, args} = createHandlerMocks();
        await assert.rejects(
          addNetworkOverride(args).handler({params, page}, response, context),
          /Exactly one of redirectUrl or responseFilePath must be provided/,
        );
        sinon.assert.notCalled(context.validateNetworkUrl);
        sinon.assert.notCalled(context.validatePath);
        sinon.assert.notCalled(page.addNetworkOverride);
      });
    }

    it('validates and adds a redirect with the requested resource type', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const override: NetworkOverride = {
        id: 7,
        kind: 'redirect',
        urlPattern: 'https://example.com/script.js*',
        resourceType: 'script',
        redirectUrl: 'https://example.com/replacement.js',
      };
      page.addNetworkOverride.resolves(override);
      const {id, kind, ...params} = override;
      await addNetworkOverride(args).handler({params, page}, response, context);
      sinon.assert.calledOnceWithExactly(
        context.validateNetworkUrl,
        params.redirectUrl,
      );
      sinon.assert.calledOnceWithExactly(page.addNetworkOverride, {
        kind,
        ...params,
      });
      sinon.assert.notCalled(context.validatePath);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        `Added network override ${id}. Reload or navigate the page to apply it.`,
      );
    });

    it('does not add a redirect rejected by URL access policies', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.validateNetworkUrl.throws(new Error('Blocked by blocklist'));
      await assert.rejects(
        addNetworkOverride(args).handler(
          {
            params: {
              urlPattern: 'https://example.com/script.js',
              redirectUrl: 'https://blocked.example/script.js',
            },
            page,
          },
          response,
          context,
        ),
        /Blocked by blocklist/,
      );
      sinon.assert.notCalled(page.addNetworkOverride);
    });

    it('rejects contentType on a redirect', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await assert.rejects(
        addNetworkOverride(args).handler(
          {
            params: {
              urlPattern: '*',
              redirectUrl: 'https://example.com/script.js',
              contentType: 'text/javascript',
            },
            page,
          },
          response,
          context,
        ),
        /contentType can only be used with responseFilePath/,
      );
      sinon.assert.notCalled(context.validateNetworkUrl);
    });

    it('rejects local files outside negotiated roots', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.validatePath.rejects(new Error('Access denied'));
      await assert.rejects(
        addNetworkOverride(args).handler(
          {
            params: {
              urlPattern: '*',
              responseFilePath: '/outside/script.js',
            },
            page,
          },
          response,
          context,
        ),
        /Access denied/,
      );
      sinon.assert.calledOnceWithExactly(
        context.validatePath,
        '/outside/script.js',
      );
      sinon.assert.notCalled(page.addNetworkOverride);
    });

    for (const contentType of ['', 'text/javascript\r\nX-Header: value']) {
      it(`rejects invalid contentType ${JSON.stringify(contentType)}`, async () => {
        const {page, context, response, args} = createHandlerMocks();
        await assert.rejects(
          addNetworkOverride(args).handler(
            {
              params: {
                urlPattern: '*',
                responseFilePath: '/tmp/script.js',
                contentType,
              },
              page,
            },
            response,
            context,
          ),
          /contentType must be non-empty and cannot contain line breaks/,
        );
        sinon.assert.notCalled(context.validatePath);
      });
    }

    it('revalidates and reads the local file on each load', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const params = {
        urlPattern: '*',
        responseFilePath: '/tmp/script.js',
        contentType: 'text/javascript',
      };
      page.addNetworkOverride.resolves({id: 3, kind: 'file', ...params});
      const readFile = sinon
        .stub(fs, 'readFile')
        .resolves(Buffer.from('updated'));
      await addNetworkOverride(args).handler({params, page}, response, context);
      const input = page.addNetworkOverride.firstCall.args[0];
      assert.strictEqual(input.kind, 'file');
      if (input.kind !== 'file') {
        assert.fail('Expected a local-file override');
      }
      sinon.assert.calledOnceWithExactly(page.addNetworkOverride, {
        kind: 'file',
        ...params,
        resourceType: undefined,
        loadResponseFile: input.loadResponseFile,
      });
      sinon.assert.calledOnceWithExactly(
        context.validatePath,
        params.responseFilePath,
      );
      sinon.assert.notCalled(readFile);
      assert.deepStrictEqual(
        await input.loadResponseFile(),
        Buffer.from('updated'),
      );
      sinon.assert.calledWithExactly(
        context.validatePath.secondCall,
        params.responseFilePath,
      );
      sinon.assert.calledOnceWithMatch(
        readFile,
        sinon.match.same(params.responseFilePath),
      );
      context.validatePath.rejects(new Error('Access denied'));
      await assert.rejects(input.loadResponseFile(), /Access denied/);
      sinon.assert.calledOnce(readFile);
    });

    it('reports an empty override list', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.listNetworkOverrides.returns([]);
      await listNetworkOverrides(args).handler(
        {params: {}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.listNetworkOverrides);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'No network overrides are configured for this page.',
      );
    });

    it('lists redirect and file overrides by id', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.listNetworkOverrides.returns([
        {
          id: 1,
          kind: 'redirect',
          urlPattern: '*',
          redirectUrl: 'https://example.com/script.js',
        },
        {
          id: 2,
          kind: 'file',
          urlPattern: '*.js',
          resourceType: 'script',
          responseFilePath: '/tmp/script.js',
          contentType: 'text/javascript',
        },
      ]);
      await listNetworkOverrides(args).handler(
        {params: {}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.listNetworkOverrides);
      sinon.assert.calledWithExactly(
        response.appendResponseLine.firstCall,
        '1: * -> https://example.com/script.js',
      );
      sinon.assert.calledWithExactly(
        response.appendResponseLine.secondCall,
        '2: *.js [script] -> /tmp/script.js (text/javascript)',
      );
    });

    it('removes an override by id', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.removeNetworkOverride.resolves(true);
      await removeNetworkOverride(args).handler(
        {params: {id: 7}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.removeNetworkOverride, 7);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Removed network override 7.',
      );
    });

    it('reports an unknown override id', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.removeNetworkOverride.resolves(false);
      await assert.rejects(
        removeNetworkOverride(args).handler(
          {params: {id: 99}, page},
          response,
          context,
        ),
        /Network override 99 was not found/,
      );
      sinon.assert.calledOnceWithExactly(page.removeNetworkOverride, 99);
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
