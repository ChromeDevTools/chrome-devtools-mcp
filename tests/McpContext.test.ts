/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import {Locator} from 'puppeteer';
import sinon from 'sinon';

import {UncaughtError} from '../src/collectors/PageCollector.js';
import {ServiceWorkerConsoleCollector} from '../src/collectors/ServiceWorkerCollector.js';
import {NetworkFormatter} from '../src/formatters/NetworkFormatter.js';
import {McpContext} from '../src/McpContext.js';
import {McpPage} from '../src/McpPage.js';
import {HeapSnapshotManager} from '../src/processors/HeapSnapshotManager.js';
import {TaskRunner} from '../src/utils/TaskRunner.js';
import {TextSnapshot} from '../src/TextSnapshot.js';
import {
  type Browser,
  type HTTPResponse,
  ScreenRecorder,
  type Target,
  TargetType,
} from '../src/third_party/index.js';
import {
  parseRawTraceBuffer,
  type TraceResult,
  traceResultIsSuccess,
} from '../src/processors/PerformanceTrace.js';
import {resolveCanonicalPath} from '../src/utils/files.js';
import {stableIdSymbol} from '../src/utils/id.js';

import type {ServerConfig} from '../src/config/ServerConfig.js';
import {
  createMockMcpWorker,
  createMockPuppeteerBrowser,
  createMockPuppeteerPage,
  createMockPuppeteerTarget,
  createMockServerConfig,
} from './mocks.js';
import {serverHooks, TestServer} from './server.js';
import {loadTraceAsBuffer} from './trace-processing/fixtures/load.js';
import {
  assertNoServiceWorkerReported,
  createConnectedMcpContext,
  createTempDir,
  createTempFile,
  getMockBrowser,
  getMockRequest,
  html,
  withBrowser,
  withMcpContext,
  stabilizeStructuredContent,
} from './utils.js';

const EXTENSION_WITH_SW_PATH = path.join(
  import.meta.dirname,
  '../../tests/tools/fixtures/extension-sw',
);
const EXTENSION_CONTENT_SCRIPT_PATH = path.join(
  import.meta.dirname,
  '../../tests/tools/fixtures/extension-content-script',
);

describe('McpContext', () => {
  it('preserves real focus during page listing and automatic fallback', async () => {
    const focusStates: boolean[] = [];
    await withMcpContext(async (_response, context) => {
      const initialPage = context.getSelectedMcpPage().pptrPage;
      const fallbackPage = await context.browser.newPage();
      const foregroundPage = await context.browser.newPage();
      await foregroundPage.bringToFront();

      focusStates.push(await initialPage.evaluate(() => document.hasFocus()));
      await context.createPagesSnapshot();
      focusStates.push(await initialPage.evaluate(() => document.hasFocus()));

      await initialPage.close();
      await context.createPagesSnapshot();
      assert.strictEqual(context.getSelectedMcpPage().pptrPage, fallbackPage);
      focusStates.push(await fallbackPage.evaluate(() => document.hasFocus()));

      const createdPage = await context.newPage(true);
      focusStates.push(
        await createdPage.pptrPage.evaluate(() => document.hasFocus()),
        await fallbackPage.evaluate(() => document.hasFocus()),
      );
    });
    assert.deepStrictEqual(focusStates, [false, false, false, true, false]);
  });

  function createPageTarget() {
    const page = createMockPuppeteerPage();
    page.emulateFocusedPage.resolves();
    const target = createMockPuppeteerTarget({page});
    target.type.returns(TargetType.PAGE);
    return {page, target};
  }

  async function createMockContext(options?: {
    browser?: sinon.SinonStubbedInstance<Browser>;
    config?: ServerConfig;
    heapSnapshotManager?: HeapSnapshotManager;
    targets?: Target[];
  }) {
    const browser = options?.browser ?? createMockPuppeteerBrowser();
    const defaultTarget = createMockPuppeteerTarget();
    browser.targets.returns(options?.targets ?? [defaultTarget]);
    return await createConnectedMcpContext(
      browser,
      {
        config: options?.config ?? createMockServerConfig(),
        heapSnapshotManager:
          options?.heapSnapshotManager ??
          new HeapSnapshotManager(new TaskRunner()),
      },
      Locator,
    );
  }

  describe('getServiceWorkerConsoleData', () => {
    it('resolves the service worker ID to the collector extension ID', async () => {
      const browser = createMockPuppeteerBrowser();
      browser.targets.returns([]);
      const context = await createConnectedMcpContext(
        browser,
        {
          config: createMockServerConfig({
            performanceCrux: false,
          }),
          heapSnapshotManager: new HeapSnapshotManager(new TaskRunner()),
        },
        Locator,
      );
      const worker = createMockMcpWorker({
        id: 'sw-3',
        url: 'chrome-extension://extension-id/background.js',
      });
      const getWorkerById = sinon
        .stub(context, 'getWorkerById')
        .returns(worker);
      const messages = [
        Object.assign(
          new UncaughtError(
            {
              exceptionId: 1,
              text: 'Service worker error',
              lineNumber: 0,
              columnNumber: 0,
            },
            'extension-id',
          ),
          {[stableIdSymbol]: 1},
        ),
      ];
      const getData = sinon
        .stub(ServiceWorkerConsoleCollector.prototype, 'getData')
        .returns(messages);

      const result = context.getServiceWorkerConsoleData('sw-3');

      sinon.assert.calledOnceWithExactly(getWorkerById, 'sw-3');
      sinon.assert.calledOnceWithExactly(getData, 'extension-id');
      assert.strictEqual(result, messages);
      context.dispose();
    });

    for (const serviceWorkerId of ['sw-404', 'extension-id', 'dw-1', 'shw-2']) {
      it(`rejects ${serviceWorkerId} without reading console data`, async () => {
        const browser = createMockPuppeteerBrowser();
        browser.targets.returns([]);
        const context = await createConnectedMcpContext(
          browser,
          {
            config: createMockServerConfig({
              performanceCrux: false,
            }),
            heapSnapshotManager: new HeapSnapshotManager(new TaskRunner()),
          },
          Locator,
        );
        const getWorkerById = sinon.stub(context, 'getWorkerById');
        getWorkerById
          .withArgs('dw-1')
          .returns(createMockMcpWorker({id: 'dw-1', type: 'dedicated_worker'}));
        getWorkerById
          .withArgs('shw-2')
          .returns(createMockMcpWorker({id: 'shw-2', type: 'shared_worker'}));
        const getData = sinon.stub(
          ServiceWorkerConsoleCollector.prototype,
          'getData',
        );

        assert.throws(
          () => context.getServiceWorkerConsoleData(serviceWorkerId),
          /Service worker not found\./,
        );

        sinon.assert.calledOnceWithExactly(getWorkerById, serviceWorkerId);
        sinon.assert.notCalled(getData);
        context.dispose();
      });
    }
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
      await context.getSelectedMcpPage().emulate({cpuThrottlingRate: 2});
      const timeoutAfter = page.pptrPage.getDefaultTimeout();
      assert(timeoutBefore < timeoutAfter, 'Timeout was less then expected');
    });
  });

  it('should update default timeout when network conditions changes', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const timeoutBefore = page.pptrPage.getDefaultNavigationTimeout();
      await context
        .getSelectedMcpPage()
        .emulate({networkConditions: 'Slow 3G'});
      const timeoutAfter = page.pptrPage.getDefaultNavigationTimeout();
      assert(timeoutBefore < timeoutAfter, 'Timeout was less then expected');
    });
  });

  it('should call waitForEventsAfterAction with correct multipliers', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();

      await context.getSelectedMcpPage().emulate({
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
        assert.ok(await page.getDevToolsPage());

        // A devtools page is tracked but excluded from the listing, so its id
        // must not resolve through `getPageById()` (which backs `select_page`
        // and every other pageId tool). A second snapshot guarantees the
        // devtools page is enrolled.
        await context.createPagesSnapshot();
        const listed = context.getPages();
        assert.ok(
          listed.every(
            mcpPage => !mcpPage.pptrPage.url().startsWith('devtools://'),
          ),
          'listing should exclude devtools pages',
        );
        const listedIds = new Set(listed.map(mcpPage => mcpPage.id));
        for (let id = 1; id < 30; id++) {
          if (listedIds.has(id)) {
            continue;
          }
          assert.throws(() => context.getPageById(id), /No page found/);
        }
      },
      {
        autoOpenDevTools: true,
      },
    );
  });

  it('drops pages reaching internal chrome or chrome-untrusted schemes by any route', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const pageId = page.id;
      assert.strictEqual(context.getPageById(pageId), page);

      const urlStub = sinon
        .stub(page.pptrPage, 'url')
        .returns('chrome://settings');
      try {
        await context.createPagesSnapshot();
        const listed = context.getPages();
        assert.ok(
          !listed.some(p => p.id === pageId),
          'page reaching chrome://settings should be dropped from listing',
        );
        assert.throws(() => context.getPageById(pageId), /No page found/);
      } finally {
        urlStub.restore();
      }
    });
  });

  it('drops pages with chrome-extension schemes unless categoryExtensions is enabled', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const pageId = page.id;

      const urlStub = sinon
        .stub(page.pptrPage, 'url')
        .returns('chrome-extension://some-ext-id/popup.html');
      try {
        await context.createPagesSnapshot();
        const listed = context.getPages();
        assert.ok(
          !listed.some(p => p.id === pageId),
          'extension page should be dropped from listing when categoryExtensions is disabled',
        );
        assert.throws(() => context.getPageById(pageId), /No page found/);
      } finally {
        urlStub.restore();
      }
    });
  });

  it('keeps pages with chrome://newtab/ and chrome://inspect', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const pageId = page.id;

      const newtabStub = sinon
        .stub(page.pptrPage, 'url')
        .returns('chrome://newtab/');
      try {
        await context.createPagesSnapshot();
        const listed = context.getPages();
        assert.ok(
          listed.some(p => p.id === pageId),
          'chrome://newtab/ should be kept in listing',
        );
        assert.strictEqual(context.getPageById(pageId), page);
      } finally {
        newtabStub.restore();
      }

      const inspectStub = sinon
        .stub(page.pptrPage, 'url')
        .returns('chrome://inspect/#devices');
      try {
        await context.createPagesSnapshot();
        const listed = context.getPages();
        assert.ok(
          listed.some(p => p.id === pageId),
          'chrome://inspect should be kept in listing',
        );
        assert.strictEqual(context.getPageById(pageId), page);
      } finally {
        inspectStub.restore();
      }
    });
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
      const page1Node = page1.getAXNodeByUid(page1Uid);
      assert.ok(page1Node, 'uid should resolve from page1 snapshot');

      // Page 2: new page, set content, snapshot
      const page2 = await context.newPage();
      context.selectPage(page2);
      await page2.pptrPage.setContent(html`<button>Page2 Button</button>`);
      page2.textSnapshot = await TextSnapshot.create(page2, {
        verbose: false,
      });

      // Page 2 is now selected. Page 1's uid should still resolve.
      const node = page1.getAXNodeByUid(page1Uid);
      assert.ok(node, 'page1 uid should still resolve after page2 snapshot');
      assert.strictEqual(node?.name, 'Page1 Button');

      // The element should also be retrievable when the target page is provided.
      const element = await page1.getElementByUid(page1Uid);
      assert.ok(element, 'should get element handle from page1 snapshot uid');
    });
  });

  it('reports the fallback when the selected page is closed', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      assert.ok(context.isPageSelected(page));

      await page.pptrPage.close();
      await context.createPagesSnapshot();

      const [firstPage] = context.getPages();
      assert.ok(firstPage);
      assert.ok(context.isPageSelected(firstPage));

      const fallback = context.getSelectedPageFallback();
      assert.ok(fallback, 'fallback should be reported');
      assert.strictEqual(fallback.wasClosed, true);
    });
  });

  it('clears the fallback on the next snapshot with a valid selection', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      await page.pptrPage.close();
      await context.createPagesSnapshot();
      assert.ok(context.getSelectedPageFallback());

      // A later snapshot keeps a valid selection (e.g. the one taken before the
      // next response, or after an explicit select), so the note is not repeated.
      await context.createPagesSnapshot();
      assert.strictEqual(context.getSelectedPageFallback(), undefined);
    });
  });

  it('preserves an unread fallback across snapshots until read', async () => {
    const browser = createMockPuppeteerBrowser();
    const {target: firstTarget} = createPageTarget();
    const {page: secondPptrPage, target: secondTarget} = createPageTarget();
    const context = await createMockContext({
      browser,
      targets: [firstTarget, secondTarget],
    });
    const [, secondPage] = context.getPages();
    assert.ok(secondPage);
    context.selectPage(secondPage);
    await secondPage.init();

    secondPptrPage.isClosed.returns(true);
    browser.targets.returns([firstTarget]);

    // First snapshot detects the fallback.
    await context.createPagesSnapshot();
    // Second snapshot runs before the fallback has been read by the response
    // formatter.
    await context.createPagesSnapshot();

    assert.deepStrictEqual(context.getSelectedPageFallback(), {
      wasClosed: true,
    });

    await context.createPagesSnapshot();
    assert.strictEqual(context.getSelectedPageFallback(), undefined);
  });

  it('overwrites an unread fallback when a second fallback occurs before it is read', async () => {
    const browser = createMockPuppeteerBrowser();
    const {page: firstPptrPage, target: firstTarget} = createPageTarget();
    const {target: secondTarget} = createPageTarget();
    const {page: thirdPptrPage, target: thirdTarget} = createPageTarget();
    const context = await createMockContext({
      browser,
      targets: [firstTarget, secondTarget, thirdTarget],
    });
    const [firstPage, secondPage, thirdPage] = context.getPages();
    assert.ok(firstPage);
    assert.ok(secondPage);
    assert.ok(thirdPage);
    context.selectPage(thirdPage);
    await thirdPage.init();

    // First snapshot: thirdPage triggers a fallback to firstPage (recording
    // wasClosed: false on the third isClosed() call so it is distinguishable
    // from the second fallback).
    thirdPptrPage.isClosed
      .onFirstCall()
      .returns(true)
      .onSecondCall()
      .returns(true)
      .returns(false);
    browser.targets.returns([firstTarget, secondTarget]);
    await context.createPagesSnapshot();
    assert.ok(context.isPageSelected(firstPage));

    // Second snapshot before getSelectedPageFallback() is read: the newly
    // selected firstPage also closes and falls back to secondPage.
    firstPptrPage.isClosed.returns(true);
    browser.targets.returns([secondTarget]);
    await context.createPagesSnapshot();
    assert.ok(context.isPageSelected(secondPage));

    assert.deepStrictEqual(context.getSelectedPageFallback(), {
      wasClosed: true,
    });

    await context.createPagesSnapshot();
    assert.strictEqual(context.getSelectedPageFallback(), undefined);
  });

  it('clears the fallback when selectPage is called explicitly', async () => {
    const browser = createMockPuppeteerBrowser();
    const {target: firstTarget} = createPageTarget();
    const {page: secondPptrPage, target: secondTarget} = createPageTarget();
    const context = await createMockContext({
      browser,
      targets: [firstTarget, secondTarget],
    });
    const [firstPage, secondPage] = context.getPages();
    assert.ok(firstPage);
    assert.ok(secondPage);
    context.selectPage(secondPage);
    await secondPage.init();

    secondPptrPage.isClosed.returns(true);
    browser.targets.returns([firstTarget]);
    await context.createPagesSnapshot();

    context.selectPage(firstPage);
    assert.strictEqual(context.getSelectedPageFallback(), undefined);
  });

  it('disposes the selected page only once when context is disposed', async () => {
    const context = await createMockContext();
    const page = context.getSelectedMcpPage();
    const disposeSpy = sinon.spy(page, 'dispose');

    context.dispose();

    sinon.assert.calledOnceWithExactly(disposeSpy);
  });

  it('disposes a selected page that closed after being pruned from the snapshot', async () => {
    const browser = createMockPuppeteerBrowser();
    const {page: pptrPage, target} = createPageTarget();
    const context = await createMockContext({
      browser,
      targets: [target],
    });
    const page = context.getSelectedMcpPage();
    const disposeSpy = sinon.spy(page, 'dispose');

    // Prune the target from #mcpPages while the selected page is still open.
    browser.targets.returns([]);
    await context.createPagesSnapshot();
    sinon.assert.notCalled(disposeSpy);

    // The selected page closes before another snapshot runs.
    pptrPage.isClosed.returns(true);
    context.dispose();

    sinon.assert.calledOnceWithExactly(disposeSpy);
  });

  async function updateConfig(
    config: ServerConfig,
    context: McpContext,
    next: Partial<ServerConfig['resolved']>,
  ): Promise<void> {
    const previousArgs = config.resolved;
    config.commit(createMockServerConfig({...previousArgs, ...next}));
    await context.onConfigChanged(previousArgs);
  }

  it('falls back when the selected page is no longer a valid page target', async () => {
    const regularTarget = createMockPuppeteerTarget();
    const bgTarget = createMockPuppeteerTarget({
      type: TargetType.BACKGROUND_PAGE,
    });
    const config = createMockServerConfig({
      experimentalIncludeAllPages: true,
    });
    const context = await createMockContext({
      config,
      targets: [regularTarget, bgTarget],
    });
    const [regularPage, bgPage] = context.getPages();
    assert.ok(regularPage);
    assert.ok(bgPage);
    context.selectPage(bgPage);
    const disposeSpy = sinon.spy(bgPage, 'dispose');

    await updateConfig(config, context, {
      experimentalIncludeAllPages: false,
    });

    assert.ok(context.isPageSelected(regularPage));
    sinon.assert.calledOnceWithExactly(disposeSpy);
    assert.deepStrictEqual(context.getSelectedPageFallback(), {
      wasClosed: false,
    });
  });

  it('clears the selection when the selected page is no longer a valid page target and no other pages exist', async () => {
    const bgTarget = createMockPuppeteerTarget({
      type: TargetType.BACKGROUND_PAGE,
    });
    const config = createMockServerConfig({
      experimentalIncludeAllPages: true,
    });
    const context = await createMockContext({
      config,
      targets: [bgTarget],
    });
    const bgPage = context.getSelectedMcpPage();
    const disposeSpy = sinon.spy(bgPage, 'dispose');

    await updateConfig(config, context, {
      experimentalIncludeAllPages: false,
    });

    sinon.assert.calledOnceWithExactly(disposeSpy);
    assert.throws(() => context.getSelectedMcpPage(), /No page selected/);
    assert.deepStrictEqual(context.getSelectedPageFallback(), {
      wasClosed: false,
    });
  });

  it('preserves an unread fallback when the selection is cleared and a later snapshot selects a new page', async () => {
    const browser = createMockPuppeteerBrowser();
    const bgTarget = createMockPuppeteerTarget({
      type: TargetType.BACKGROUND_PAGE,
    });
    const config = createMockServerConfig({
      experimentalIncludeAllPages: true,
    });
    const context = await createMockContext({
      browser,
      config,
      targets: [bgTarget],
    });

    await updateConfig(config, context, {
      experimentalIncludeAllPages: false,
    });
    assert.throws(() => context.getSelectedMcpPage(), /No page selected/);

    const regularTarget = createMockPuppeteerTarget();
    browser.targets.returns([regularTarget, bgTarget]);
    await context.createPagesSnapshot();

    const [regularPage] = context.getPages();
    assert.ok(regularPage);
    assert.ok(context.isPageSelected(regularPage));
    assert.deepStrictEqual(context.getSelectedPageFallback(), {
      wasClosed: false,
    });
  });

  it('does not operate on a closed and already-disposed selected page in onConfigChanged or release methods', async () => {
    const browser = createMockPuppeteerBrowser();
    const pptrPage = createMockPuppeteerPage();
    const target = createMockPuppeteerTarget({page: pptrPage});
    const config = createMockServerConfig();
    const context = await createMockContext({
      browser,
      config,
      targets: [target],
    });
    const page = context.getSelectedMcpPage();
    pptrPage.isClosed.returns(true);
    browser.targets.returns([]);

    await context.createPagesSnapshot();

    const syncSourceMapsSpy = sinon.spy(page, 'syncSourceMaps');
    const disposeCommentBridgeSpy = sinon.spy(page, 'disposeCommentBridge');
    const disposeSpy = sinon.spy(page, 'dispose');

    await updateConfig(config, context, {sourceMaps: false});
    await context.releaseScreencasts();
    context.releaseDevToolsComments();
    context.dispose();

    sinon.assert.notCalled(syncSourceMapsSpy);
    sinon.assert.notCalled(disposeCommentBridgeSpy);
    sinon.assert.notCalled(disposeSpy);
  });

  it('does not report a fallback for a regular selection', async () => {
    await withMcpContext(async (_response, context) => {
      await context.newPage();
      await context.createPagesSnapshot();
      assert.strictEqual(context.getSelectedPageFallback(), undefined);
    });
  });

  it('keeps a still-open selected page that is missing from the list', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      assert.ok(context.isPageSelected(page));

      // A live page that is temporarily missing from the targets list must keep
      // its selection — only a genuinely closed page is replaced.
      const targets = context.browser.targets();
      const stub = sinon
        .stub(context.browser, 'targets')
        .returns(targets.filter(otherTarget => otherTarget !== page.target));
      try {
        await context.createPagesSnapshot();
      } finally {
        stub.restore();
      }

      assert.ok(
        context.isPageSelected(page),
        'a still-open page should keep its selection',
      );
      assert.strictEqual(context.getSelectedPageFallback(), undefined);
    });
  });

  it('enumerates page targets without initializing unselected pages', async () => {
    await withMcpContext(async (_response, context) => {
      const selectedPage = context.getSelectedMcpPage();
      const unselectedPptrPage = await context.browser.newPage();
      const unselectedTarget = unselectedPptrPage.target();

      await context.createPagesSnapshot();

      const unselectedMcpPage = context
        .getPages()
        .find(p => p.target === unselectedTarget);
      assert.ok(unselectedMcpPage, 'unselected target should be discovered');
      assert.notStrictEqual(unselectedMcpPage, selectedPage);
      assert.throws(() => unselectedMcpPage.pptrPage, /is not initialized/);

      await unselectedMcpPage.init();
      assert.strictEqual(unselectedMcpPage.pptrPage, unselectedPptrPage);
      await unselectedPptrPage.close();
    });
  });

  it('continues page ids across contexts so stale ids do not resolve', async () => {
    await withBrowser(async browser => {
      const options = {
        config: createMockServerConfig({
          performanceCrux: false,
        }),
        heapSnapshotManager: new HeapSnapshotManager(new TaskRunner()),
      };
      const first = await createConnectedMcpContext(browser, options, Locator);
      const idBeforeReconnect = (await first.newPage()).id;
      first.dispose();

      // A new context (as created after a browser reconnect) continues the
      // shared id counter, so an id handed out before no longer resolves and
      // the next page keeps counting up rather than colliding with it.
      const second = await createConnectedMcpContext(browser, options, Locator);
      try {
        assert.throws(
          () => second.getPageById(idBeforeReconnect),
          /No page found/,
        );
        assert.ok(
          (await second.newPage()).id > idBeforeReconnect,
          'ids continue past the pre-reconnect ids',
        );
      } finally {
        second.dispose();
        options.heapSnapshotManager.dispose();
      }
    });
  });

  it('reports an unknown page id before the last-page guard on close', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedMcpPage();
      await assert.rejects(context.closePage(99), /No page found/);
      await assert.rejects(
        context.closePage(page.id),
        /The last open page cannot be closed/,
      );
      assert.ok(!page.pptrPage.isClosed());
    });
  });

  describe('lazy browser connection', () => {
    function createLazyContext(getBrowser: () => Promise<Browser>) {
      const taskRunner = new TaskRunner();
      return McpContext.create(
        undefined,
        {
          config: createMockServerConfig({
            performanceCrux: false,
          }),
          heapSnapshotManager: new HeapSnapshotManager(taskRunner),
          taskRunner,
          getBrowser,
        },
        Locator,
      );
    }

    function createBrowser() {
      const browser = createMockPuppeteerBrowser();
      browser.targets.returns([]);
      return browser;
    }

    it('serializes concurrent createPagesSnapshot() calls', async () => {
      const browser = createBrowser();
      browser.targets.returns([createMockPuppeteerTarget()]);
      const {promise: initDone, resolve: finishInit} =
        Promise.withResolvers<void>();
      const init = sinon.stub(McpPage.prototype, 'init').resolves();
      init.onSecondCall().returns(initDone);
      const context = createLazyContext(async () => browser);
      await context.ensureBrowser();
      sinon.assert.calledOnce(init);

      const first = context.createPagesSnapshot();
      const second = context.createPagesSnapshot();
      await new Promise(resolve => setImmediate(resolve));
      sinon.assert.calledTwice(init);

      finishInit();
      await Promise.all([first, second]);
      sinon.assert.calledThrice(init);
      context.dispose();
    });

    it('returns one page task queue per page id', async () => {
      const context = createLazyContext(async () => createBrowser());
      const queue = context.pageTaskQueue(1);
      assert.strictEqual(context.pageTaskQueue(1), queue);
      assert.notStrictEqual(context.pageTaskQueue(2), queue);
      assert.strictEqual(queue.parent, context.taskQueue);
      context.dispose();
    });

    it('disposes the page task queue with the page', async () => {
      const browser = createBrowser();
      browser.targets.returns([createMockPuppeteerTarget()]);
      sinon.stub(McpPage.prototype, 'init').resolves();
      const context = createLazyContext(async () => browser);
      await context.ensureBrowser();
      const page = context.getSelectedMcpPage();
      const {promise: release, resolve: finishRunning} =
        Promise.withResolvers<void>();
      const running = (async () => {
        using guard = await context.pageTaskQueue(page.id).scheduleTask();
        await release;
      })();
      const waiting = context.pageTaskQueue(page.id).scheduleTask();

      context.dispose();

      await assert.rejects(waiting, new RegExp(`Page ${page.id} is closed\\.`));
      finishRunning();
      await running;
    });

    it('does not connect until ensureBrowser() is called', async () => {
      const browser = createBrowser();
      const getBrowser = sinon.stub<[], Promise<Browser>>().resolves(browser);
      const context = createLazyContext(getBrowser);

      sinon.assert.notCalled(getBrowser);
      assert.throws(() => context.browser, /Not connected to a browser/);

      assert.strictEqual(await context.ensureBrowser(), browser);
      assert.strictEqual(context.browser, browser);
      sinon.assert.calledOnce(getBrowser);
      context.dispose();
    });

    it('resets the browser state and reports a reconnect notice once when the browser changes', async () => {
      const firstBrowser = createBrowser();
      firstBrowser.targets.returns([createMockPuppeteerTarget()]);
      const secondBrowser = createBrowser();
      const getBrowser = sinon.stub<[], Promise<Browser>>();
      getBrowser.onFirstCall().resolves(firstBrowser);
      getBrowser.onSecondCall().resolves(secondBrowser);
      const context = createLazyContext(getBrowser);

      await context.ensureBrowser();
      assert.ok(!context.consumeReconnectNotice());
      context.getSelectedMcpPage().setIsRunningPerformanceTrace(true);

      await context.ensureBrowser();

      assert.strictEqual(context.browser, secondBrowser);
      assert.ok(!context.isRunningPerformanceTrace());
      sinon.assert.calledWith(
        firstBrowser.off,
        'targetcreated',
        sinon.match.func,
      );
      assert.ok(context.consumeReconnectNotice(), 'notice available once');
      assert.ok(!context.consumeReconnectNotice(), 'notice does not repeat');
      context.dispose();
    });

    it('starts over if initializing the browser state fails', async () => {
      const browser = createBrowser();
      browser.targets.onFirstCall().throws(new Error('init failed'));
      const context = createLazyContext(async () => browser);

      await assert.rejects(context.ensureBrowser(), /init failed/);
      assert.throws(() => context.browser, /Not connected to a browser/);

      await context.ensureBrowser();
      assert.strictEqual(context.browser, browser);
      assert.ok(!context.consumeReconnectNotice());
      context.dispose();
    });

    describe('when the browser is replaced during a hanging initialization', () => {
      function setUpHangingInit() {
        const firstBrowser = createBrowser();
        const secondBrowser = createBrowser();
        const getBrowser = sinon.stub<[], Promise<Browser>>();
        getBrowser.onFirstCall().resolves(firstBrowser);
        getBrowser.onSecondCall().resolves(secondBrowser);
        const context = createLazyContext(getBrowser);
        const hangingSnapshot = Promise.withResolvers<McpPage[]>();
        sinon
          .stub(context, 'createPagesSnapshot')
          .callThrough()
          .onFirstCall()
          .returns(hangingSnapshot.promise);
        return {context, firstBrowser, secondBrowser, hangingSnapshot};
      }

      it('does not touch the new browser state once the stale call resumes', async () => {
        const {context, firstBrowser, secondBrowser, hangingSnapshot} =
          setUpHangingInit();

        const staleCall = context.ensureBrowser();
        await context.ensureBrowser();
        for (const call of firstBrowser.on.getCalls()) {
          sinon.assert.calledWithExactly(firstBrowser.off, ...call.args);
        }
        const firstBrowserOnCalls = firstBrowser.on.callCount;
        const secondBrowserOnCalls = secondBrowser.on.callCount;

        hangingSnapshot.resolve([]);
        await assert.rejects(staleCall, /Browser was replaced/);

        assert.strictEqual(context.browser, secondBrowser);
        sinon.assert.callCount(firstBrowser.on, firstBrowserOnCalls);
        sinon.assert.callCount(secondBrowser.on, secondBrowserOnCalls);
        assert.ok(!context.consumeReconnectNotice());
        context.dispose();
      });

      it('does not reset the new browser state when the stale call fails', async () => {
        const {context, secondBrowser, hangingSnapshot} = setUpHangingInit();

        const staleCall = context.ensureBrowser();
        await context.ensureBrowser();

        hangingSnapshot.reject(new Error('init failed'));
        await assert.rejects(staleCall, /init failed/);

        assert.strictEqual(context.browser, secondBrowser);
        sinon.assert.notCalled(secondBrowser.off);
        context.dispose();
      });
    });

    describe('when the same browser is returned during a hanging initialization', () => {
      function setUpHangingInit() {
        const browser = createBrowser();
        const context = createLazyContext(async () => browser);
        const hangingSnapshot = Promise.withResolvers<McpPage[]>();
        const createPagesSnapshot = sinon
          .stub(context, 'createPagesSnapshot')
          .callThrough()
          .onFirstCall()
          .returns(hangingSnapshot.promise);
        return {context, browser, hangingSnapshot, createPagesSnapshot};
      }

      it('waits for the pending initialization', async () => {
        const {context, browser, hangingSnapshot, createPagesSnapshot} =
          setUpHangingInit();

        const firstCall = context.ensureBrowser();
        let joinedCallSettled = false;
        const joinedCall = context.ensureBrowser().finally(() => {
          joinedCallSettled = true;
        });
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(!joinedCallSettled);

        hangingSnapshot.resolve([]);
        assert.strictEqual(await firstCall, browser);
        assert.strictEqual(await joinedCall, browser);
        sinon.assert.calledOnce(createPagesSnapshot);
        sinon.assert.notCalled(browser.off);
        context.dispose();
      });

      it('fails the joined call too and starts over on the next call', async () => {
        const {context, browser, hangingSnapshot, createPagesSnapshot} =
          setUpHangingInit();

        const firstCall = context.ensureBrowser();
        const joinedCall = context.ensureBrowser();
        hangingSnapshot.reject(new Error('init failed'));
        await assert.rejects(firstCall, /init failed/);
        await assert.rejects(joinedCall, /init failed/);
        assert.throws(() => context.browser, /Not connected to a browser/);

        assert.strictEqual(await context.ensureBrowser(), browser);
        sinon.assert.calledTwice(createPagesSnapshot);
        context.dispose();
      });
    });
  });

  it('should include network requests in structured content', async t => {
    await withMcpContext(async (response, context) => {
      const mockRequest = getMockRequest({
        url: 'http://example.com/api',
        stableId: 123,
      });

      sinon
        .stub(context.getSelectedMcpPage(), 'getNetworkRequests')
        .returns([mockRequest]);

      response.setIncludeNetworkRequests(true);
      const result = await response.handle(context);
      t.assert.snapshot(stabilizeStructuredContent(result.structuredContent));
    });
  });

  it('should include detailed network request in structured content', async t => {
    await withMcpContext(async (response, context) => {
      const mockRequest = getMockRequest({
        url: 'http://example.com/detail',
        stableId: 456,
      });

      sinon
        .stub(context.getSelectedMcpPage(), 'getNetworkRequestById')
        .returns(mockRequest);

      response.attachNetworkRequest(456);
      const result = await response.handle(context);

      t.assert.snapshot(stabilizeStructuredContent(result.structuredContent));
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

      sinon
        .stub(context.getSelectedMcpPage(), 'getNetworkRequestById')
        .returns(mockRequest);

      // Use os.tmpdir() so validatePath passes on all platforms (macOS tmpdir
      // is /var/folders/..., not /tmp, so hardcoded /tmp paths are rejected).
      const reqFilePath = path.join(os.tmpdir(), 'req.txt');
      const resFilePath = path.join(os.tmpdir(), 'res.txt');

      // We stub NetworkFormatter.from to avoid actual file system writes and verify arguments
      const fromStub = sinon
        .stub(NetworkFormatter, 'from')
        .callsFake(async (_req, opts) => {
          // Verify we received the platform-correct file paths
          assert.strictEqual(opts?.requestFilePath, reqFilePath);
          assert.strictEqual(opts?.responseFilePath, resFilePath);
          // Return fixed strings in toJSONDetailed so the snapshot is stable
          // across platforms (os.tmpdir() differs on macOS vs Linux/Windows).
          return {
            toStringDetailed: () => 'Detailed string',
            toJSONDetailed: () => ({
              requestBody: '/tmp/req.txt',
              responseBody: '/tmp/res.txt',
            }),
          } as unknown as NetworkFormatter;
        });

      response.attachNetworkRequest(789, {
        requestFilePath: reqFilePath,
        responseFilePath: resFilePath,
      });
      const result = await response.handle(context);

      t.assert.snapshot(stabilizeStructuredContent(result.structuredContent));

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
    using workspace = createTempDir('workspace-test-', os.homedir());
    await withMcpContext(async (_response, context) => {
      const roots = [
        {uri: pathToFileURL(workspace.path).href, name: 'workspace'},
      ];
      context.setRoots(roots);
      // Valid path within root
      const targetPath = path.join(workspace.path, 'test.txt');
      const resolved = await context.validatePath(targetPath);
      assert.strictEqual(resolved, await resolveCanonicalPath(targetPath));
      const resolvedWorkspace = await context.validatePath(workspace.path);
      assert.strictEqual(
        resolvedWorkspace,
        await resolveCanonicalPath(workspace.path),
      );

      // Invalid path outside root and outside temp dir
      const outsidePath = path.resolve(os.homedir(), 'outside-test.txt');
      await assert.rejects(context.validatePath(outsidePath), /Access denied/);
    });
  });

  it('validatePath allows non-existent nested paths within roots', async () => {
    using workspace = createTempDir('workspace-test-nested-', os.homedir());
    await withMcpContext(async (_response, context) => {
      const roots = [
        {uri: pathToFileURL(workspace.path).href, name: 'workspace'},
      ];
      context.setRoots(roots);
      // Valid path within root with non-existent intermediate directories
      const targetPath = path.join(workspace.path, 'dir1', 'dir2', 'test.txt');
      const resolved = await context.validatePath(targetPath);
      assert.strictEqual(resolved, await resolveCanonicalPath(targetPath));
    });
  });

  it('validatePath allows all paths if roots are undefined and allowUnrestrictedPaths is set', async () => {
    await withMcpContext(
      async (_response, context) => {
        context.setRoots(undefined);
        const targetPath = path.resolve(os.homedir(), 'anywhere.txt');
        const resolved = await context.validatePath(targetPath);
        assert.strictEqual(resolved, await resolveCanonicalPath(targetPath));
      },
      {allowUnrestrictedPaths: true},
    );
  });

  it('validatePath returns undefined if filePath is undefined', async () => {
    await withMcpContext(async (_response, context) => {
      const resolved = await context.validatePath(undefined);
      assert.strictEqual(resolved, undefined);
    });
  });

  it('validatePath returns resolved absolute path for relative paths', async () => {
    await withMcpContext(async (_response, context) => {
      const tmpDir = os.tmpdir();
      const relativeTmpPath = path.relative(
        process.cwd(),
        path.join(tmpDir, 'test.txt'),
      );
      const resolved = await context.validatePath(relativeTmpPath);
      assert.strictEqual(resolved, await resolveCanonicalPath(relativeTmpPath));
    });
  });

  it('validatePath denies paths outside tmpdir if roots are undefined and allowUnrestrictedPaths is not set', async () => {
    await withMcpContext(async (_response, context) => {
      // setRoots() never called — simulates a client that skips roots capability.
      const outsidePath = path.resolve(os.homedir(), 'anywhere.txt');
      await assert.rejects(context.validatePath(outsidePath), /Access denied/);
      // Temp dir must still be reachable.
      const tmpPath = path.join(os.tmpdir(), 'test.txt');
      const resolved = await context.validatePath(tmpPath);
      assert.strictEqual(resolved, await resolveCanonicalPath(tmpPath));
    });
  });

  it('validatePath denies paths outside os.tmpdir() if roots list is empty', async () => {
    await withMcpContext(async (_response, context) => {
      context.setRoots([]);
      // Should allow temp dir
      const tmpPath = path.join(os.tmpdir(), 'test.txt');
      const resolved = await context.validatePath(tmpPath);
      assert.strictEqual(resolved, await resolveCanonicalPath(tmpPath));

      // Should deny outside temp dir
      await assert.rejects(
        context.validatePath(path.resolve(os.homedir(), 'anywhere.txt')),
        /Access denied/,
      );
    });
  });

  describe('symlink security checks', () => {
    // Symlinks are not followed on Windows by default.
    if (os.platform() === 'win32') {
      return;
    }

    it('validatePath resolves symlinks and returns the canonical path', async () => {
      using tmpDir = createTempDir('validate-symlink-test-');
      await withMcpContext(async (_response, context) => {
        const targetDir = path.join(tmpDir.path, 'target');
        await fs.mkdir(targetDir);
        const targetFile = path.join(targetDir, 'file.txt');
        await fs.writeFile(targetFile, 'hello');

        const symlinkDir = path.join(tmpDir.path, 'symlink_dir');
        await fs.symlink(targetDir, symlinkDir, 'dir');

        const canonicalTarget = await fs.realpath(targetDir);
        context.setRoots([
          {uri: pathToFileURL(canonicalTarget).href, name: 'target'},
        ]);

        const filePathWithSymlink = path.join(symlinkDir, 'file.txt');
        const resolved = await context.validatePath(filePathWithSymlink);
        assert.strictEqual(resolved, path.join(canonicalTarget, 'file.txt'));
      });
    });

    it('saveFile allows writing to a symlinked file if it resolves to an allowed path', async () => {
      using tmpDir = createTempDir('mcp-symlink-test-');
      await withMcpContext(async (_response, context) => {
        context.setRoots([
          {uri: pathToFileURL(tmpDir.path).href, name: 'temp'},
        ]);

        const targetPath = path.join(tmpDir.path, 'target.txt');
        await fs.writeFile(targetPath, 'original content', 'utf-8');

        const symlinkPath = path.join(tmpDir.path, 'symlink.txt');
        await fs.symlink(targetPath, symlinkPath);

        const data = new TextEncoder().encode('content');
        await context.saveFile(data, symlinkPath, '.txt');
        await context.saveFile(data, targetPath, '.txt');

        const content = await fs.readFile(targetPath, 'utf-8');
        assert.strictEqual(content, 'content');
      });
    });

    it('saveFile refuses to write through a dangling symlink to a non-existent file', async () => {
      using tmpDir = createTempDir('mcp-symlink-test-');
      using outsideDir = createTempDir('mcp-outside-test-');
      await withMcpContext(async (_response, context) => {
        context.setRoots([
          {uri: pathToFileURL(tmpDir.path).href, name: 'temp'},
        ]);

        const outsideTarget = path.join(outsideDir.path, 'target.txt');
        const symlinkPath = path.join(tmpDir.path, 'symlink.txt');
        await fs.symlink(outsideTarget, symlinkPath);

        const data = new TextEncoder().encode('malicious content');
        await assert.rejects(
          context.saveFile(data, symlinkPath, '.txt'),
          /Could not write/,
        );

        await assert.rejects(fs.stat(outsideTarget));
      });
    });

    it('saveFile allows writing to a file within an allowed symlinked directory', async () => {
      using tmpDir = createTempDir('mcp-symlink-test-');
      await withMcpContext(async (_response, context) => {
        context.setRoots([
          {uri: pathToFileURL(tmpDir.path).href, name: 'temp'},
        ]);

        const realDir = path.join(tmpDir.path, 'real_dir');
        await fs.mkdir(realDir, {recursive: true});

        const symlinkedDir = path.join(tmpDir.path, 'symlinked_dir');
        await fs.symlink(realDir, symlinkedDir);

        const targetFilePath = path.join(symlinkedDir, 'test.txt');
        const data = new TextEncoder().encode('allowed content');

        const result = await context.saveFile(data, targetFilePath, '.txt');
        assert.strictEqual(
          result.filename,
          await resolveCanonicalPath(targetFilePath),
        );
        const content = await fs.readFile(
          path.join(realDir, 'test.txt'),
          'utf-8',
        );
        assert.strictEqual(content, 'allowed content');
      });
    });
  });

  describe('loadResource', () => {
    describe('file protocol', () => {
      it('calls validatePath', async () => {
        using testFile = createTempFile(
          'test content',
          'load-resource-test.txt',
        );
        await withMcpContext(async (_response, context) => {
          const validatePathSpy = sinon.spy(context, 'validatePath');
          const url = pathToFileURL(testFile.path).href;
          const content = await context.loadResource(url);
          assert.strictEqual(content, 'test content');
          sinon.assert.calledWith(validatePathSpy, testFile.path);
        });
      });

      it('is not blocked by allowlist', async () => {
        using testFile = createTempFile(
          'test content',
          'load-resource-test-allow.txt',
        );
        await withMcpContext(
          async (_response, context) => {
            const url = pathToFileURL(testFile.path).href;
            const content = await context.loadResource(url);
            assert.strictEqual(content, 'test content');
          },
          {
            allowedUrlPattern: ['https://example.com/allowed*'],
          },
        );
      });
    });

    describe('https protocol', () => {
      async function createNetworkPolicyContext(options: {
        allowlist?: string[];
        blocklist?: string[];
      }) {
        const browser = getMockBrowser();
        browser.pages = async () => [];
        browser.targets = () => [];
        return await createConnectedMcpContext(
          browser,
          {
            config: createMockServerConfig({
              performanceCrux: false,
              allowedUrlPattern: options.allowlist,
              blockedUrlPattern: options.blocklist,
            }),
            heapSnapshotManager: new HeapSnapshotManager(new TaskRunner()),
          },
          Locator,
        );
      }

      async function withServers<T>(
        servers: TestServer[],
        callback: () => Promise<T>,
      ): Promise<T> {
        for (const server of servers) {
          await server.start();
        }
        try {
          return await callback();
        } finally {
          for (const server of servers.reverse()) {
            await server.stop();
          }
        }
      }
      it('respects blocklist by throwing if blocked', async () => {
        await withMcpContext(
          async (_response, context) => {
            await assert.rejects(() =>
              context.loadResource('https://example.com/blocked'),
            );
          },
          {
            blockedUrlPattern: ['https://example.com/blocked*'],
          },
        );
      });

      it('respects blocklist by not throwing if not blocked', async () => {
        await withMcpContext(
          async (_response, context) => {
            sinon.stub(globalThis, 'fetch').resolves({
              ok: true,
              text: async () => 'mock data',
            } as Response);

            const content = await context.loadResource(
              'https://example.com/allowed',
            );
            assert.strictEqual(content, 'mock data');
          },
          {
            blockedUrlPattern: ['https://example.com/blocked*'],
          },
        );
      });

      it('respects allowlist by throwing if not allowed', async () => {
        await withMcpContext(
          async (_response, context) => {
            await assert.rejects(() =>
              context.loadResource('https://example.com/blocked'),
            );
          },
          {
            allowedUrlPattern: ['https://example.com/allowed*'],
          },
        );
      });

      it('respects allowlist by not throwing if allowed', async () => {
        await withMcpContext(
          async (_response, context) => {
            sinon.stub(globalThis, 'fetch').resolves({
              ok: true,
              text: async () => 'mock data',
            } as Response);

            const content = await context.loadResource(
              'https://example.com/allowed',
            );
            assert.strictEqual(content, 'mock data');
          },
          {
            allowedUrlPattern: ['https://example.com/allowed*'],
          },
        );
      });

      it('rejects redirects outside the allowlist', async () => {
        const allowedServer = new TestServer(TestServer.randomPort());
        const forbiddenServer = new TestServer(TestServer.randomPort());
        forbiddenServer.addRoute('/secret', (_req, res) => {
          res.end('FORBIDDEN_BODY');
        });
        allowedServer.addRoute('/redirect', (_req, res) => {
          res.writeHead(302, {
            Location: forbiddenServer.getRoute('/secret'),
          });
          res.end();
        });
        await withServers([allowedServer, forbiddenServer], async () => {
          const context = await createNetworkPolicyContext({
            allowlist: [allowedServer.getRoute('/redirect')],
          });
          try {
            await assert.rejects(
              () => context.loadResource(allowedServer.getRoute('/redirect')),
              /Not allowed by allowlist/,
            );
          } finally {
            context.dispose();
          }
        });
      });

      it('rejects redirects into the blocklist', async () => {
        const allowedServer = new TestServer(TestServer.randomPort());
        const forbiddenServer = new TestServer(TestServer.randomPort());
        forbiddenServer.addRoute('/secret', (_req, res) => {
          res.end('FORBIDDEN_BODY');
        });
        allowedServer.addRoute('/redirect', (_req, res) => {
          res.writeHead(302, {
            Location: forbiddenServer.getRoute('/secret'),
          });
          res.end();
        });
        await withServers([allowedServer, forbiddenServer], async () => {
          const context = await createNetworkPolicyContext({
            blocklist: [forbiddenServer.getRoute('/secret')],
          });
          try {
            await assert.rejects(
              () => context.loadResource(allowedServer.getRoute('/redirect')),
              /Blocked by blocklist/,
            );
          } finally {
            context.dispose();
          }
        });
      });

      it('rejects a blocked intermediate redirect hop', async () => {
        const startServer = new TestServer(TestServer.randomPort());
        const blockedServer = new TestServer(TestServer.randomPort());
        const finalServer = new TestServer(TestServer.randomPort());
        finalServer.addRoute('/final', (_req, res) => {
          res.end('FINAL_BODY');
        });
        blockedServer.addRoute('/bounce', (_req, res) => {
          res.writeHead(302, {
            Location: finalServer.getRoute('/final'),
          });
          res.end();
        });
        startServer.addRoute('/redirect', (_req, res) => {
          res.writeHead(302, {
            Location: blockedServer.getRoute('/bounce'),
          });
          res.end();
        });
        await withServers(
          [startServer, blockedServer, finalServer],
          async () => {
            const context = await createNetworkPolicyContext({
              blocklist: [blockedServer.getRoute('/bounce')],
            });
            try {
              await assert.rejects(
                () => context.loadResource(startServer.getRoute('/redirect')),
                /Blocked by blocklist/,
              );
            } finally {
              context.dispose();
            }
          },
        );
      });

      it('follows redirects when every hop is allowed', async () => {
        const server = new TestServer(TestServer.randomPort());
        server.addRoute('/final', (_req, res) => {
          res.end('ALLOWED_BODY');
        });
        server.addRoute('/redirect', (_req, res) => {
          res.writeHead(302, {
            Location: server.getRoute('/final'),
          });
          res.end();
        });
        await withServers([server], async () => {
          const context = await createNetworkPolicyContext({
            allowlist: [server.baseUrl + '/*'],
          });
          try {
            assert.strictEqual(
              await context.loadResource(server.getRoute('/redirect')),
              'ALLOWED_BODY',
            );
          } finally {
            context.dispose();
          }
        });
      });
    });

    describe('getDevToolsData', () => {
      it('returns devtools data from passed page', async () => {
        await withMcpContext(async (_response, context) => {
          const mockPage = sinon.createStubInstance(McpPage);
          mockPage.getDevToolsData.resolves({cdpBackendNodeId: 42});
          const result = await context.getDevToolsData(mockPage);
          assert.deepStrictEqual(result, {cdpBackendNodeId: 42});
        });
      });

      it('returns undefined when getDevToolsData times out', async () => {
        await withMcpContext(async (_response, context) => {
          const mockPage = sinon.createStubInstance(McpPage);
          mockPage.getDevToolsData.returns(
            new Promise(resolve => {
              setTimeout(() => resolve({cdpBackendNodeId: 100}), 600);
            }),
          );
          const result = await context.getDevToolsData(mockPage);
          assert.strictEqual(result, undefined);
        });
      });

      it('returns empty object from selected page when devtools is closed', async () => {
        await withMcpContext(async (_response, context) => {
          const result = await context.getDevToolsData();
          assert.deepStrictEqual(result, {});
        });
      });
    });

    describe('getSelectedMcpPageUrl', () => {
      it('returns url from passed page when open', async () => {
        await withMcpContext(async (_response, context) => {
          const page = await context.newPage();
          const result = context.getSelectedMcpPageUrl(page);
          assert.strictEqual(result, page.pptrPage.url());
        });
      });

      it('returns undefined from passed page when closed', async () => {
        await withMcpContext(async (_response, context) => {
          const page = await context.newPage();
          await page.pptrPage.close();
          const result = context.getSelectedMcpPageUrl(page);
          assert.strictEqual(result, undefined);
        });
      });

      it('returns url from selected page when no page passed', async () => {
        await withMcpContext(async (_response, context) => {
          const page = context.getSelectedMcpPage();
          const result = context.getSelectedMcpPageUrl();
          assert.strictEqual(result, page.pptrPage.url());
        });
      });

      it('returns undefined when getSelectedMcpPage throws', async () => {
        await withMcpContext(async (_response, context) => {
          sinon
            .stub(context, 'getSelectedMcpPage')
            .throws(new Error('No page selected'));
          const result = context.getSelectedMcpPageUrl();
          assert.strictEqual(result, undefined);
        });
      });

      it('returns undefined when selected page is closed and getSelectedMcpPage throws', async () => {
        await withMcpContext(async (_response, context) => {
          const page = context.getSelectedMcpPage();
          await page.pptrPage.close();
          assert.throws(() => context.getSelectedMcpPage());
          const result = context.getSelectedMcpPageUrl();
          assert.strictEqual(result, undefined);
        });
      });
    });
  });

  describe('onConfigChanged', () => {
    it('reads the updated CrUX setting from the shared config', async () => {
      const config = createMockServerConfig({
        performanceCrux: true,
      });
      const context = await createMockContext({config});

      await updateConfig(config, context, {performanceCrux: false});

      assert.strictEqual(context.isCruxEnabled(), false);
    });

    it('reads the updated allowUnrestrictedPaths setting from the shared config', async () => {
      const config = createMockServerConfig({
        allowUnrestrictedPaths: false,
      });
      const context = await createMockContext({config});
      const outsidePath = path.resolve(os.homedir(), 'anywhere.txt');
      await assert.rejects(context.validatePath(outsidePath), /Access denied/);

      await updateConfig(config, context, {allowUnrestrictedPaths: true});

      assert.strictEqual(
        await context.validatePath(outsidePath),
        await resolveCanonicalPath(outsidePath),
      );
    });

    it('updates sourceMaps on existing pages only when changed', async () => {
      const config = createMockServerConfig({
        sourceMaps: true,
      });
      const context = await createMockContext({config});
      const mcpPage = context.getSelectedMcpPage();
      const syncSourceMapsSpy = sinon.spy(mcpPage, 'syncSourceMaps');

      await updateConfig(config, context, {sourceMaps: true});
      sinon.assert.notCalled(syncSourceMapsSpy);

      await updateConfig(config, context, {sourceMaps: false});
      sinon.assert.calledOnceWithExactly(syncSourceMapsSpy);

      syncSourceMapsSpy.resetHistory();
      await updateConfig(config, context, {
        performanceCrux: false,
        sourceMaps: false,
      });
      sinon.assert.notCalled(syncSourceMapsSpy);

      await updateConfig(config, context, {sourceMaps: true});
      sinon.assert.calledOnceWithExactly(syncSourceMapsSpy);
    });

    it('refreshes the pages when experimentalIncludeAllPages changes', async () => {
      const config = createMockServerConfig({
        experimentalIncludeAllPages: false,
      });
      const context = await createMockContext({config});
      const snapshotSpy = sinon.spy(context, 'createPagesSnapshot');

      await updateConfig(config, context, {experimentalIncludeAllPages: true});

      sinon.assert.calledOnceWithExactly(snapshotSpy);
    });

    it('releases feature state when capabilities transition from enabled to disabled', async () => {
      const config = createMockServerConfig({
        memoryDebugging: true,
        devtoolsComments: true,
      });
      const context = await createMockContext({config});
      const releaseScreencasts = sinon
        .stub(context, 'releaseScreencasts')
        .resolves();
      const releaseHeapSnapshots = sinon.stub(context, 'releaseHeapSnapshots');
      const releasePerformanceTrace = sinon
        .stub(context, 'releasePerformanceTrace')
        .resolves();
      const releaseDevToolsComments = sinon.stub(
        context,
        'releaseDevToolsComments',
      );

      await updateConfig(config, context, {
        categoryDebugging: false,
        categoryPerformance: false,
        memoryDebugging: false,
      });

      sinon.assert.calledOnceWithExactly(releaseScreencasts);
      sinon.assert.calledOnceWithExactly(releaseHeapSnapshots);
      sinon.assert.calledOnceWithExactly(releasePerformanceTrace);
      sinon.assert.calledOnceWithExactly(releaseDevToolsComments);
    });

    it('releases feature state when switching to slim mode', async () => {
      const config = createMockServerConfig({
        memoryDebugging: true,
        devtoolsComments: true,
      });
      const context = await createMockContext({config});
      const releaseScreencasts = sinon
        .stub(context, 'releaseScreencasts')
        .resolves();
      const releaseHeapSnapshots = sinon.stub(context, 'releaseHeapSnapshots');
      const releasePerformanceTrace = sinon
        .stub(context, 'releasePerformanceTrace')
        .resolves();
      const releaseDevToolsComments = sinon.stub(
        context,
        'releaseDevToolsComments',
      );

      await updateConfig(config, context, {slim: true});

      sinon.assert.calledOnceWithExactly(releaseScreencasts);
      sinon.assert.calledOnceWithExactly(releaseHeapSnapshots);
      sinon.assert.calledOnceWithExactly(releasePerformanceTrace);
      sinon.assert.calledOnceWithExactly(releaseDevToolsComments);
    });

    it('does not release state of capabilities that stay enabled or stay disabled', async () => {
      const config = createMockServerConfig({
        memoryDebugging: false,
        devtoolsComments: true,
      });
      const context = await createMockContext({config});
      const releaseScreencasts = sinon
        .stub(context, 'releaseScreencasts')
        .resolves();
      const releaseHeapSnapshots = sinon.stub(context, 'releaseHeapSnapshots');
      const releasePerformanceTrace = sinon
        .stub(context, 'releasePerformanceTrace')
        .resolves();
      const releaseDevToolsComments = sinon.stub(
        context,
        'releaseDevToolsComments',
      );

      await updateConfig(config, context, {
        memoryDebugging: false,
        devtoolsComments: true,
      });

      sinon.assert.notCalled(releaseScreencasts);
      sinon.assert.notCalled(releaseHeapSnapshots);
      sinon.assert.notCalled(releasePerformanceTrace);
      sinon.assert.notCalled(releaseDevToolsComments);
    });
  });

  describe('releaseState', () => {
    it('stops and clears the screencast recording', async () => {
      const context = await createMockContext();
      const page = context.getSelectedMcpPage();
      const recorder = sinon.createStubInstance(ScreenRecorder);
      recorder.stop.resolves();
      page.setScreenRecorder({recorder, filePath: '/tmp/video.mp4'});

      await context.releaseScreencasts();

      sinon.assert.calledOnceWithExactly(recorder.stop);
      assert.strictEqual(page.getScreenRecorder(), null);
    });

    it('clears the screencast recording when stopping fails', async () => {
      const context = await createMockContext();
      const page = context.getSelectedMcpPage();
      const recorder = sinon.createStubInstance(ScreenRecorder);
      recorder.stop.rejects(new Error('ffmpeg error'));
      page.setScreenRecorder({recorder, filePath: '/tmp/video.mp4'});

      await context.releaseScreencasts();

      sinon.assert.calledOnceWithExactly(recorder.stop);
      assert.strictEqual(page.getScreenRecorder(), null);
    });

    it('disposes loaded heap snapshots', async () => {
      const heapSnapshotManager = new HeapSnapshotManager(new TaskRunner());
      const context = await createMockContext({
        heapSnapshotManager,
      });
      await context.getHeapSnapshotStats(
        path.join(process.cwd(), 'tests/fixtures/example.heapsnapshot'),
      );

      context.releaseHeapSnapshots();

      assert.strictEqual(heapSnapshotManager.hasSnapshots(), false);
    });

    it('does not dispose heapSnapshotManager when no snapshots are loaded', async () => {
      const heapSnapshotManager = new HeapSnapshotManager(new TaskRunner());
      const disposeSpy = sinon.spy(heapSnapshotManager, 'dispose');
      const context = await createMockContext({heapSnapshotManager});

      context.releaseHeapSnapshots();

      sinon.assert.notCalled(disposeSpy);
    });

    it('stops the running performance trace and clears recorded traces', async () => {
      const {page: pptrPage, target} = createPageTarget();
      const context = await createMockContext({targets: [target]});
      context.getSelectedMcpPage().setIsRunningPerformanceTrace(true);
      const traceResult = await parseRawTraceBuffer(
        loadTraceAsBuffer('basic-trace.json.gz'),
      );
      assert.ok(traceResultIsSuccess(traceResult));
      context.storeTraceRecording(traceResult);

      await context.releasePerformanceTrace();

      sinon.assert.calledOnceWithExactly(pptrPage.tracing.stop);
      assert.strictEqual(context.isRunningPerformanceTrace(), false);
      assert.deepStrictEqual(context.recordedTraces(), []);
    });

    it('disposes comment bridges once per page when devtoolsComments is released', async () => {
      const context = await createMockContext();
      const mcpPage = context.getSelectedMcpPage();
      const disposeCommentBridgeSpy = sinon.spy(
        mcpPage,
        'disposeCommentBridge',
      );

      context.releaseDevToolsComments();

      sinon.assert.calledOnceWithExactly(disposeCommentBridgeSpy);
    });
  });

  describe('extensions', () => {
    const server = serverHooks();

    it('manages extension lifecycle (install, list, get, reload, triggerAction, and uninstall)', async () => {
      await withMcpContext(
        async (_response, context) => {
          const extensionId = await context.installExtension(
            EXTENSION_WITH_SW_PATH,
          );

          let extensions = await context.listExtensions();
          assert.ok(
            extensions.has(extensionId),
            `Extension with ID "${extensionId}" should be installed`,
          );

          const extension = await context.getExtension(extensionId);
          assert.ok(extension, 'Extension should be returned');
          assert.strictEqual(extension.id, extensionId);
          assert.strictEqual(extension.path, EXTENSION_WITH_SW_PATH);

          await context.installExtension(extension.path);
          extensions = await context.listExtensions();
          assert.ok(
            extensions.has(extensionId),
            'Extension should still be installed after reload',
          );

          const targetsBefore = context.browser.targets();
          const pageTargetBefore = targetsBefore.find(
            t => t.type() === 'page' && t.url().includes(extensionId),
          );
          assert.ok(!pageTargetBefore, 'Page should not exist before action');

          await context.triggerExtensionAction(extensionId);

          const pageTargetAfter = await context.browser.waitForTarget(
            t => t.type() === 'page' && t.url().includes(extensionId),
          );
          assert.ok(pageTargetAfter, 'Page should exist after action');

          await context.uninstallExtension(extensionId);
          extensions = await context.listExtensions();
          assert.ok(
            !extensions.has(extensionId),
            `Extension with ID "${extensionId}" should NOT be installed`,
          );

          const targets = context.browser.targets();
          assertNoServiceWorkerReported(targets, extensionId);
        },
        {},
        {
          categoryExtensions: true,
        },
      );
    });

    it('verifies that content script console logs are received', async () => {
      await withMcpContext(
        async (_response, context) => {
          server.addHtmlRoute(
            '/test-content-script',
            html`<h1>Test Content Script</h1>`,
          );
          const url = server.getRoute('/test-content-script');

          const extensionId = await context.installExtension(
            EXTENSION_CONTENT_SCRIPT_PATH,
          );

          const mcpPage = context.getSelectedMcpPage();
          const page = mcpPage.pptrPage;

          await page.goto(url);

          const messages = mcpPage.getConsoleData(true);
          const hasContentScriptLog = messages.some(
            message =>
              'text' in message &&
              typeof message.text === 'function' &&
              message.text().includes('from content script!'),
          );
          assert.ok(
            hasContentScriptLog,
            'Console output should contain message from content script.',
          );

          await context.uninstallExtension(extensionId);
        },
        {},
        {
          categoryExtensions: true,
        },
      );
    });
  });
});
