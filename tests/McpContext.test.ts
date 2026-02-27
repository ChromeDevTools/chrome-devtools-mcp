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

import {getMockRequest, html, withMcpContext} from './utils.js';

describe('McpContext', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('list pages', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedPptrPage();
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
      const stub = sinon.spy(context, 'getWaitForHelper');

      await context.waitForEventsAfterAction(async () => {
        // trigger the waiting only
      });

      sinon.assert.calledWithExactly(stub, page.pptrPage, 2, 10);
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
      const page1 = context.getSelectedPptrPage();
      await page1.setContent(html`<button>Page1 Button</button>`);
      await context.createTextSnapshot(false, undefined, page1);

      // Capture a uid from page1's snapshot (snapshotId=1, button is node 1)
      const page1Uid = '1_1';
      const page1Node = context.getAXNodeByUid(page1Uid);
      assert.ok(page1Node, 'uid should resolve from page1 snapshot');

      // Page 2: new page, set content, snapshot
      const page2 = await context.newPage();
      context.selectPage(page2);
      await page2.pptrPage.setContent(html`<button>Page2 Button</button>`);
      await context.createTextSnapshot(false, undefined, page2.pptrPage);

      // Page 2 is now selected. Page 1's uid should still resolve.
      const node = context.getAXNodeByUid(page1Uid);
      assert.ok(node, 'page1 uid should still resolve after page2 snapshot');
      assert.strictEqual(node?.name, 'Page1 Button');

      // The element should also be retrievable when the target page is provided.
      const element = await context.getElementByUid(page1Uid, page1);
      assert.ok(element, 'should get element handle from page1 snapshot uid');
    });
  });

  describe('getElementByUid context-focus validation', () => {
    it('resolves for the focused page in an isolated context', async () => {
      await withMcpContext(async (_response, context) => {
        const page = await context.newPage(false, 'agent-a');
        await page.pptrPage.setContent(html`<button>A1 Button</button>`);
        await context.createTextSnapshot(false, undefined, page.pptrPage);

        // page is focused for agent-a context; should resolve.
        const handle = await context.getElementByUid('1_1');
        void handle.dispose();
      });
    });

    it('throws for a non-focused page in the same context', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA1 = await context.newPage(false, 'agent-a');
        await pageA1.pptrPage.setContent(html`<button>A1 Button</button>`);
        await context.createTextSnapshot(false, undefined, pageA1.pptrPage);
        const a1Uid = '1_1'; // button on pageA1

        // Open a second page in the same context (becomes focused).
        const pageA2 = await context.newPage(false, 'agent-a');
        await pageA2.pptrPage.setContent(html`<button>A2 Button</button>`);
        await context.createTextSnapshot(false, undefined, pageA2.pptrPage);

        // pageA2 is now focused for agent-a; clicking pageA1's uid should throw.
        await assert.rejects(
          () => context.getElementByUid(a1Uid),
          (err: Error) => {
            assert.ok(err.message.includes('belongs to page'));
            assert.ok(err.message.includes('currently selected'));
            return true;
          },
        );
      });
    });

    it('resolves after cross-context select_page race', async () => {
      await withMcpContext(async (_response, context) => {
        // Set up two pages in separate isolated contexts.
        const pageA = await context.newPage(false, 'agent-a');
        await pageA.pptrPage.setContent(html`<button>Agent A Button</button>`);
        await context.createTextSnapshot(false, undefined, pageA.pptrPage);
        const uidA = '1_1';

        const pageB = await context.newPage(false, 'agent-b');
        await pageB.pptrPage.setContent(html`<button>Agent B Button</button>`);
        await context.createTextSnapshot(false, undefined, pageB.pptrPage);
        const uidB = '2_1';

        // Simulate race: agent-a selects its page, then agent-b overwrites global.
        context.selectPage(pageA);
        context.selectPage(pageB);
        // Global #selectedPage is now pageB.

        // Agent A's uid should still resolve (per-context focus for agent-a is pageA).
        const handleA = await context.getElementByUid(uidA);
        void handleA.dispose();
        // Agent B's uid should also resolve.
        const handleB = await context.getElementByUid(uidB);
        void handleB.dispose();
      });
    });

    it('aligns global selectedPage after resolution', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA = await context.newPage(false, 'agent-a');
        await pageA.pptrPage.setContent(html`<button>Agent A Button</button>`);
        await context.createTextSnapshot(false, undefined, pageA.pptrPage);
        const uidA = '1_1';

        const pageB = await context.newPage(false, 'agent-b');
        await pageB.pptrPage.setContent(html`<button>Agent B Button</button>`);
        await context.createTextSnapshot(false, undefined, pageB.pptrPage);

        // Global is on pageB after newPage.
        assert.strictEqual(context.getSelectedMcpPage(), pageB);

        // Resolve uid from pageA; should pass and align global.
        const handle = await context.getElementByUid(uidA);
        void handle.dispose();
        assert.strictEqual(context.getSelectedMcpPage(), pageA);
      });
    });

    it('throws for nonexistent uid', async () => {
      await withMcpContext(async (_response, context) => {
        const page = await context.newPage(false, 'agent-a');
        await page.pptrPage.setContent(html`<button>A Button</button>`);
        await context.createTextSnapshot(false, undefined, page.pptrPage);

        await assert.rejects(() => context.getElementByUid('nonexistent_99'), {
          message: 'No such element found in any snapshot.',
        });
      });
    });

    it('resolves for default context page alongside isolated contexts', async () => {
      await withMcpContext(async (_response, context) => {
        // Default context page (already exists from withMcpContext setup).
        const defaultPage = context.getSelectedPptrPage();
        await defaultPage.setContent(html`<button>Default Button</button>`);
        await context.createTextSnapshot(false, undefined, defaultPage);
        const defaultUid = '1_1';

        // Isolated context page.
        const isoPage = await context.newPage(false, 'agent-a');
        await isoPage.pptrPage.setContent(
          html`<button>Isolated Button</button>`,
        );
        await context.createTextSnapshot(false, undefined, isoPage.pptrPage);
        const isoUid = '2_1';

        // Global is now isoPage. Default context focus is still defaultPage.
        // Both should resolve via per-context lookup.
        const handleDefault = await context.getElementByUid(defaultUid);
        void handleDefault.dispose();
        const handleIso = await context.getElementByUid(isoUid);
        void handleIso.dispose();
      });
    });

    it('scopes search to target page when page is provided', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA = await context.newPage(false, 'agent-a');
        await pageA.pptrPage.setContent(html`<button>Agent A Button</button>`);
        await context.createTextSnapshot(false, undefined, pageA.pptrPage);
        const uidA = '1_1';

        const pageB = await context.newPage(false, 'agent-b');
        await pageB.pptrPage.setContent(html`<button>Agent B Button</button>`);
        await context.createTextSnapshot(false, undefined, pageB.pptrPage);

        // uidA belongs to pageA; searching with pageB should throw.
        await assert.rejects(
          () => context.getElementByUid(uidA, pageB.pptrPage),
          {
            message: /not found on page/,
          },
        );

        // Searching with the correct page should resolve.
        const handle = await context.getElementByUid(uidA, pageA.pptrPage);
        void handle.dispose();
      });
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
});
