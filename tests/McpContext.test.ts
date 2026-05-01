/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import sinon from 'sinon';

import {NetworkFormatter} from '../src/formatters/NetworkFormatter.js';
import {TextSnapshot} from '../src/TextSnapshot.js';
import type {HTTPResponse} from '../src/third_party/index.js';
import type {TraceResult} from '../src/trace-processing/parse.js';

import {getMockRequest, html, withMcpContext} from './utils.js';

describe('McpContext', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('list pages', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent(
        html`<button>Click me</button>
          <input
            type="text"
            value="Input"
          />`,
      );
      page.textSnapshot = await TextSnapshot.create(page);
      assert.ok(await page.getElementByUid('1_1'));
      page.textSnapshot = await TextSnapshot.create(page);
      await page.getElementByUid('1_1');
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
      const timeoutBefore = page.pptrPage.getDefaultTimeout();
      await context.emulate({cpuThrottlingRate: 2});
      const timeoutAfter = page.pptrPage.getDefaultTimeout();
      assert(timeoutBefore < timeoutAfter, 'Timeout was less then expected');
    });
  });

  it('should update default timeout when network conditions changes', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const timeoutBefore = page.pptrPage.getDefaultNavigationTimeout();
      await context.emulate({networkConditions: 'Slow 3G'});
      const timeoutAfter = page.pptrPage.getDefaultNavigationTimeout();
      assert(timeoutBefore < timeoutAfter, 'Timeout was less then expected');
    });
  });

  it('should call waitForEventsAfterAction with correct multipliers', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();

      await context.emulate({
        cpuThrottlingRate: 2,
        networkConditions: 'Slow 3G',
      });
      const stub = sinon.spy(page, 'createWaitForHelper');

      await page.waitForEventsAfterAction(async () => {
        // trigger the waiting only
      });

      sinon.assert.calledWithExactly(stub, 2, 10);
    });
  });

  it('should should detect open DevTools pages', async () => {
    await withMcpContext(
      async (_response, context) => {
        const page = await context.newPage();
        await context.createPagesSnapshot();
        assert.ok(page.devToolsPage);
      },
      {
        autoOpenDevTools: true,
      },
    );
  });
  it('resolves uid from a non-selected page snapshot', async () => {
    await withMcpContext(async (_response, context) => {
      // Page 1: set content and snapshot
      const page1 = context.getSelectedMcpPage();
      await page1.pptrPage.setContent(html`<button>Page1 Button</button>`);
      page1.textSnapshot = await TextSnapshot.create(page1, {
        verbose: false,
      });

      // Capture a uid from page1's snapshot (snapshotId=1, button is node 1)
      const page1Uid = '1_1';
      const page1Node = context.getAXNodeByUid(page1Uid);
      assert.ok(page1Node, 'uid should resolve from page1 snapshot');

      // Page 2: new page, set content, snapshot
      const page2 = await context.newPage();
      context.selectPage(page2);
      await page2.pptrPage.setContent(html`<button>Page2 Button</button>`);
      page2.textSnapshot = await TextSnapshot.create(page2, {
        verbose: false,
      });

      // Page 2 is now selected. Page 1's uid should still resolve.
      const node = context.getAXNodeByUid(page1Uid);
      assert.ok(node, 'page1 uid should still resolve after page2 snapshot');
      assert.strictEqual(node?.name, 'Page1 Button');

      // The element should also be retrievable when the target page is provided.
      const element = await page1.getElementByUid(page1Uid);
      assert.ok(element, 'should get element handle from page1 snapshot uid');
    });
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

  it('can store and retrieve roots', async () => {
    await withMcpContext(async (_response, context) => {
      const roots = [{uri: 'file:///test', name: 'test'}];
      context.setRoots(roots);
      const actualRoots = context.roots();
      assert.ok(
        actualRoots?.some(r => r.name === 'test'),
        'Should contain the set root',
      );
      assert.ok(
        actualRoots?.some(r => r.name === 'temp'),
        'Should contain the temp root',
      );
    });
  });

  it('validatePath allows paths within roots', async () => {
    await withMcpContext(async (_response, context) => {
      const workspacePath = path.resolve(os.homedir(), 'workspace-test');
      const roots = [
        {uri: pathToFileURL(workspacePath).href, name: 'workspace'},
      ];
      context.setRoots(roots);
      // Valid path within root
      context.validatePath(path.join(workspacePath, 'test.txt'));
      context.validatePath(workspacePath);

      // Invalid path outside root and outside temp dir
      const outsidePath = path.resolve(os.homedir(), 'outside-test.txt');
      assert.throws(() => context.validatePath(outsidePath), /Access denied/);
    });
  });

  it('validatePath allows all paths if roots are undefined (legacy)', async () => {
    await withMcpContext(async (_response, context) => {
      context.setRoots(undefined);
      context.validatePath(path.resolve(os.homedir(), 'anywhere.txt'));
    });
  });

  it('validatePath denies paths outside os.tmpdir() if roots list is empty', async () => {
    await withMcpContext(async (_response, context) => {
      context.setRoots([]);
      // Should allow temp dir
      context.validatePath(path.join(os.tmpdir(), 'test.txt'));

      // Should deny outside temp dir
      assert.throws(
        () => context.validatePath(path.resolve(os.homedir(), 'anywhere.txt')),
        /Access denied/,
      );
    });
  });
});
