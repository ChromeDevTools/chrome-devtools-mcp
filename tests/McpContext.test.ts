/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {NetworkFormatter} from '../src/formatters/NetworkFormatter.js';
import type {HTTPResponse} from '../src/third_party/index.js';
import type {TraceResult} from '../src/trace-processing/parse.js';
import type {TextSnapshotNode} from '../src/types.js';

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
      await context.createTextSnapshot(context.getSelectedMcpPage());
      assert.ok(await page.getElementByUid('1_1'));
      await context.createTextSnapshot(context.getSelectedMcpPage());
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
        assert.ok(context.getDevToolsPage(page.pptrPage));
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
      await context.createTextSnapshot(page1, false, undefined);

      // Capture a uid from page1's snapshot (snapshotId=1, button is node 1)
      const page1Uid = '1_1';
      const page1Node = context.getAXNodeByUid(page1Uid);
      assert.ok(page1Node, 'uid should resolve from page1 snapshot');

      // Page 2: new page, set content, snapshot
      const page2 = await context.newPage();
      context.selectPage(page2);
      await page2.pptrPage.setContent(html`<button>Page2 Button</button>`);
      await context.createTextSnapshot(page2, false, undefined);

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

  it('inserts extraHandles into the snapshot correctly', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent(html`
        <div
          id="parent"
          role="main"
        >
          <div
            id="middle"
            role="none"
          >
            <button id="child">Click me</button>
          </div>
        </div>
      `);

      const middleHandle = await page.pptrPage.$('#middle');
      if (!middleHandle) {
        throw new Error('middle element not found');
      }

      const backendNodeId = await middleHandle.backendNodeId();
      if (!backendNodeId) {
        throw new Error('Failed to get backendNodeId');
      }

      // Verify it is not in the snapshot by default (due to role="none")
      await context.createTextSnapshot(page, false, undefined, []);
      const snapshotBefore = page.getSnapshot();
      if (!snapshotBefore) {
        throw new Error('Snapshot not created');
      }

      let foundMiddleBefore = false;
      for (const node of snapshotBefore.idToNode.values()) {
        if (node.backendNodeId === backendNodeId) {
          foundMiddleBefore = true;
          break;
        }
      }
      assert.ok(
        !foundMiddleBefore,
        'Middle element should NOT be in the snapshot when not passed as extra handle',
      );

      // Now take snapshot with extra handle
      await context.createTextSnapshot(page, false, undefined, [middleHandle]);

      const snapshot = page.getSnapshot();
      if (!snapshot) {
        throw new Error('Snapshot not created');
      }

      // Find the extra node in idToNode
      let extraNode: TextSnapshotNode | undefined;
      for (const node of snapshot.idToNode.values()) {
        if (node.backendNodeId === backendNodeId) {
          extraNode = node;
          break;
        }
      }

      assert.ok(extraNode, 'Extra node should be in the snapshot');
      assert.strictEqual(
        extraNode.role,
        'div',
        'Extra node should have role "div"',
      );

      // Check if the child was moved to extraNode
      const childHandle = await page.pptrPage.$('#child');
      if (!childHandle) {
        throw new Error('child element not found');
      }
      const childBackendNodeId = await childHandle.backendNodeId();

      let foundChild = false;
      for (const child of extraNode.children) {
        if (child.backendNodeId === childBackendNodeId) {
          foundChild = true;
          break;
        }
      }
      assert.ok(
        foundChild,
        'Child node should be moved to extra node children',
      );

      // Find parent node in snapshot
      const parentHandle = await page.pptrPage.$('#parent');
      if (!parentHandle) {
        throw new Error('parent element not found');
      }
      const parentBackendId = await parentHandle.backendNodeId();

      let parentNode: TextSnapshotNode | undefined;
      for (const node of snapshot.idToNode.values()) {
        if (node.backendNodeId === parentBackendId) {
          parentNode = node;
          break;
        }
      }

      assert.ok(parentNode, 'Parent node should be in snapshot');

      // Check that child is NOT a child of parent anymore
      let foundChildInParent = false;
      for (const child of parentNode.children) {
        if (child.backendNodeId === childBackendNodeId) {
          foundChildInParent = true;
          break;
        }
      }
      assert.ok(
        !foundChildInParent,
        'Child node should NOT be in parent children',
      );

      // Check that middle IS a child of parent
      let foundMiddleInParent = false;
      for (const child of parentNode.children) {
        if (child.backendNodeId === backendNodeId) {
          foundMiddleInParent = true;
          break;
        }
      }
      assert.ok(
        foundMiddleInParent,
        'Middle node should be in parent children',
      );
    });
  });
});
