/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {NetworkFormatter} from '../src/formatters/NetworkFormatter.js';
import type {HTTPResponse} from '../src/third_party/index.js';
import type {TraceResult} from '../src/trace-processing/parse.js';

import {getMockRequest, html, withMcpContext} from './utils.js';

describe('McpContext', () => {
  it('list pages', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(
        html`<button>Click me</button>
          <input
            type="text"
            value="Input"
          />`,
      );
      await context.createTextSnapshot();
      assert.ok(await context.getElementByUid('1_1'));
      await context.createTextSnapshot();
      await context.getElementByUid('1_1');
    });
  });

  it('can store and retrieve the latest performance trace', async () => {
    await withMcpContext(async (_response, context) => {
      const fakeTrace1 = {} as unknown as TraceResult;
      const fakeTrace2 = {} as unknown as TraceResult;
      context.storeTraceRecording(fakeTrace1);
      context.storeTraceRecording(fakeTrace2);
      assert.deepEqual(context.recordedTraces(), [fakeTrace2]);
    });
  });

  it('should update default timeout when cpu throttling changes', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const timeoutBefore = page.getDefaultTimeout();
      context.setCpuThrottlingRate(2);
      const timeoutAfter = page.getDefaultTimeout();
      assert(timeoutBefore < timeoutAfter, 'Timeout was less then expected');
    });
  });

  it('should update default timeout when network conditions changes', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const timeoutBefore = page.getDefaultNavigationTimeout();
      context.setNetworkConditions('Slow 3G');
      const timeoutAfter = page.getDefaultNavigationTimeout();
      assert(timeoutBefore < timeoutAfter, 'Timeout was less then expected');
    });
  });

  it('should call waitForEventsAfterAction with correct multipliers', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();

      context.setCpuThrottlingRate(2);
      context.setNetworkConditions('Slow 3G');
      const stub = sinon.spy(context, 'getWaitForHelper');

      await context.waitForEventsAfterAction(async () => {
        // trigger the waiting only
      });

      sinon.assert.calledWithExactly(stub, page, 2, 10);
    });
  });

  it('should should detect open DevTools pages', async () => {
    await withMcpContext(
      async (_response, context) => {
        const page = await context.newPage();
        // TODO: we do not know when the CLI flag to auto open DevTools will run
        // so we need this until
        // https://github.com/puppeteer/puppeteer/issues/14368 is there.
        await new Promise(resolve => setTimeout(resolve, 5000));
        await context.createPagesSnapshot();
        assert.ok(context.getDevToolsPage(page));
      },
      {
        autoOpenDevTools: true,
      },
    );
  });
  it('should include network requests in structured content', async t => {
    await withMcpContext(async (response, context) => {
      const mockRequest = getMockRequest({
        url: 'http://example.com/api',
        stableId: 123,
      });

      sinon.stub(context, 'getNetworkRequests').returns([mockRequest]);
      sinon.stub(context, 'getNetworkRequestStableId').returns(123);

      response.setIncludeNetworkRequests(true);
      const result = await response.handle('test', context);

      t.assert.snapshot?.(JSON.stringify(result.structuredContent, null, 2));
    });
  });

  it('should include detailed network request in structured content', async t => {
    await withMcpContext(async (response, context) => {
      const mockRequest = getMockRequest({
        url: 'http://example.com/detail',
        stableId: 456,
      });

      sinon.stub(context, 'getNetworkRequestById').returns(mockRequest);
      sinon.stub(context, 'getNetworkRequestStableId').returns(456);

      response.attachNetworkRequest(456);
      const result = await response.handle('test', context);

      t.assert.snapshot?.(JSON.stringify(result.structuredContent, null, 2));
    });
  });

  it('should include file paths in structured content when saving to file', async t => {
    await withMcpContext(async (response, context) => {
      const mockRequest = getMockRequest({
        url: 'http://example.com/file-save',
        stableId: 789,
        hasPostData: true,
        postData: 'some detailed data',
        response: {
          status: () => 200,
          headers: () => ({'content-type': 'text/plain'}),
          buffer: async () => Buffer.from('some response data'),
        } as unknown as HTTPResponse,
      });

      sinon.stub(context, 'getNetworkRequestById').returns(mockRequest);
      sinon.stub(context, 'getNetworkRequestStableId').returns(789);

      // We stub NetworkFormatter.from to avoid actual file system writes and verify arguments
      const fromStub = sinon
        .stub(NetworkFormatter, 'from')
        .callsFake(async (_req, opts) => {
          // Verify we received the file paths
          assert.strictEqual(opts?.requestFilePath, '/tmp/req.txt');
          assert.strictEqual(opts?.responseFilePath, '/tmp/res.txt');
          // Return a dummy formatter that behaves as if it saved files
          // We need to create a real instance or mock one.
          // Since constructor is private, we can't easily new it up.
          // But we can return a mock object.
          return {
            toStringDetailed: () => 'Detailed string',
            toJSONDetailed: () => ({
              requestBody: '/tmp/req.txt',
              responseBody: '/tmp/res.txt',
            }),
          } as unknown as NetworkFormatter;
        });

      response.attachNetworkRequest(789, {
        requestFilePath: '/tmp/req.txt',
        responseFilePath: '/tmp/res.txt',
      });
      const result = await response.handle('test', context);

      t.assert.snapshot?.(JSON.stringify(result.structuredContent, null, 2));

      fromStub.restore();
    });
  });
});
