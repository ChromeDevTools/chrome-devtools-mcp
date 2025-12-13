/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {Debugger} from 'debug';
import type {
  Browser,
  CDPSession,
  ConsoleMessage,
  Dialog,
  ElementHandle,
  HTTPRequest,
  Page,
  SerializedAXNode,
  PredefinedNetworkConditions,
} from 'puppeteer-core';

import {NetworkCollector, PageCollector} from './PageCollector.js';
import {pages} from './tools/pages.js';
import {CLOSE_PAGE_ERROR} from './tools/ToolDefinition.js';
import type {Context} from './tools/ToolDefinition.js';
import type {TraceResult} from './trace-processing/parse.js';
import {WaitForHelper} from './WaitForHelper.js';
import {
  BrowserConnectionManager,
  type ConnectionManagerOptions,
} from './browser-connection-manager.js';

export interface TextSnapshotNode extends SerializedAXNode {
  id: string;
  children: TextSnapshotNode[];
}

export interface TextSnapshot {
  root: TextSnapshotNode;
  idToNode: Map<string, TextSnapshotNode>;
  snapshotId: string;
}

const DEFAULT_TIMEOUT = 5_000;
const NAVIGATION_TIMEOUT = 10_000;

function getNetworkMultiplierFromString(condition: string | null): number {
  const puppeteerCondition =
    condition as keyof typeof PredefinedNetworkConditions;

  switch (puppeteerCondition) {
    case 'Fast 4G':
      return 1;
    case 'Slow 4G':
      return 2.5;
    case 'Fast 3G':
      return 5;
    case 'Slow 3G':
      return 10;
  }
  return 1;
}

export class McpContext implements Context {
  browser: Browser;
  logger: Debugger;
  connectionManager: BrowserConnectionManager;

  // The most recent page state.
  #pages: Page[] = [];
  #selectedPageIdx = 0;
  // The most recent snapshot.
  #textSnapshot: TextSnapshot | null = null;
  #networkCollector: NetworkCollector;
  #consoleCollector: PageCollector<ConsoleMessage | Error>;

  #isRunningTrace = false;
  #networkConditionsMap = new WeakMap<Page, string>();
  #cpuThrottlingRateMap = new WeakMap<Page, number>();
  #dialog?: Dialog;

  #nextSnapshotId = 1;
  #traceResults: TraceResult[] = [];

  // CDP Session management (v0.8.4+)
  #browserSession?: CDPSession;
  #pageSessions = new Map<Page, CDPSession>();

  private constructor(
    browser: Browser,
    logger: Debugger,
    browserFactory?: () => Promise<Browser>,
    connectionOptions?: ConnectionManagerOptions,
  ) {
    this.browser = browser;
    this.logger = logger;
    this.connectionManager = new BrowserConnectionManager(connectionOptions);

    // Set up browser instance and factory for reconnection
    if (browserFactory) {
      this.connectionManager.setBrowser(browser, browserFactory);
    }

    this.#networkCollector = new NetworkCollector(
      this.browser,
      (page, collect) => {
        page.on('request', request => {
          collect(request);
        });
      },
    );

    this.#consoleCollector = new PageCollector(
      this.browser,
      (page, collect) => {
        page.on('console', event => {
          collect(event);
        });
        page.on('pageerror', event => {
          if (event instanceof Error) {
            collect(event);
          } else {
            const error = new Error(`${event}`);
            error.stack = undefined;
            collect(error);
          }
        });
      },
    );
  }

  async #init() {
    await this.createPagesSnapshot();
    this.setSelectedPageIdx(0);
    await this.#networkCollector.init();
    await this.#consoleCollector.init();
  }

  static async from(
    browser: Browser,
    logger: Debugger,
    browserFactory?: () => Promise<Browser>,
    connectionOptions?: ConnectionManagerOptions,
  ) {
    const context = new McpContext(browser, logger, browserFactory, connectionOptions);
    await context.#init();
    return context;
  }

  /**
   * Dispose all CDP sessions to prevent memory leaks
   */
  async #disposeSessions(): Promise<void> {
    await Promise.allSettled([
      this.#browserSession?.detach(),
      ...[...this.#pageSessions.values()].map(s => s.detach())
    ]);
    this.#browserSession = undefined;
    this.#pageSessions.clear();
  }

  /**
   * Reinitialize CDP protocol domains after reconnection
   * This ensures proper CDP event handling after browser restart
   */
  async reinitializeCDP(): Promise<void> {
    try {
      // 1. Dispose old sessions to prevent leaks
      await this.#disposeSessions();

      // 2. Create browser-level CDP session (public API, not _client())
      this.#browserSession = await this.browser.target().createCDPSession();
      this.logger('CDP: Browser-level session created');

      // 3. Enable Target discovery and auto-attach
      try {
        await this.#browserSession.send('Target.setDiscoverTargets', { discover: true });
        this.logger('CDP: Target discovery enabled');
      } catch (err) {
        this.logger('Warning: Failed to enable target discovery:', err);
      }

      try {
        await this.#browserSession.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true
        });
        this.logger('CDP: Auto-attach configured');
      } catch (err) {
        this.logger('Warning: Failed to configure auto-attach:', err);
      }

      // 4. Enable essential CDP domains for all targets
      for (const target of this.browser.targets()) {
        const type = target.type();

        if (type === 'page') {
          const page = await target.page();
          if (!page) continue;

          try {
            const session = await page.createCDPSession();

            await Promise.allSettled([
              session.send('Network.enable'),
              session.send('Runtime.enable'),
              session.send('Log.enable'),
            ]);

            this.#pageSessions.set(page, session);
            this.logger(`CDP domains enabled for ${type}: ${page.url()}`);
          } catch (err) {
            this.logger(`Warning: Failed to enable CDP domains for ${type} ${page.url()}:`, err);
          }
        }

        // Service Worker / Worker support can be added here if needed
        // if (type === 'service_worker' || type === 'worker') { ... }
      }

      this.logger('CDP protocol reinitialization completed');
    } catch (err) {
      this.logger('Error during CDP reinitialization:', err);
      // Don't throw - this is a best-effort operation
      // The browser should still be usable even if CDP setup partially fails
    }
  }

  /**
   * Update browser instance after reconnection
   */
  async updateBrowser(newBrowser: Browser): Promise<void> {
    // Dispose old sessions first
    await this.#disposeSessions();

    this.browser = newBrowser;
    this.connectionManager.setBrowser(newBrowser, async () => newBrowser);

    // Reinitialize CDP protocol domains BEFORE collectors
    // This ensures CDP events are properly set up
    await this.reinitializeCDP();

    // Reinitialize collectors for new browser
    await this.#networkCollector.init();
    await this.#consoleCollector.init();

    // Recreate pages snapshot
    await this.createPagesSnapshot();
    this.setSelectedPageIdx(0);

    this.logger('Browser instance updated after reconnection');
  }

  getNetworkRequests(): HTTPRequest[] {
    const page = this.getSelectedPage();
    return this.#networkCollector.getData(page);
  }

  getConsoleData(): Array<ConsoleMessage | Error> {
    const page = this.getSelectedPage();
    return this.#consoleCollector.getData(page);
  }

  async newPage(): Promise<Page> {
    const page = await this.browser.newPage();
    const pages = await this.createPagesSnapshot();
    this.setSelectedPageIdx(pages.indexOf(page));
    this.#networkCollector.addPage(page);
    this.#consoleCollector.addPage(page);
    return page;
  }
  async closePage(pageIdx: number): Promise<void> {
    if (this.#pages.length === 1) {
      throw new Error(CLOSE_PAGE_ERROR);
    }
    const page = this.getPageByIdx(pageIdx);
    this.setSelectedPageIdx(0);
    await page.close({runBeforeUnload: false});
  }

  getNetworkRequestByUrl(url: string): HTTPRequest {
    const requests = this.getNetworkRequests();
    if (!requests.length) {
      throw new Error('No requests found for selected page');
    }

    for (const request of requests) {
      if (request.url() === url) {
        return request;
      }
    }

    throw new Error('Request not found for selected page');
  }

  setNetworkConditions(conditions: string | null): void {
    const page = this.getSelectedPage();
    if (conditions === null) {
      this.#networkConditionsMap.delete(page);
    } else {
      this.#networkConditionsMap.set(page, conditions);
    }
    this.#updateSelectedPageTimeouts();
  }

  getNetworkConditions(): string | null {
    const page = this.getSelectedPage();
    return this.#networkConditionsMap.get(page) ?? null;
  }

  setCpuThrottlingRate(rate: number): void {
    const page = this.getSelectedPage();
    this.#cpuThrottlingRateMap.set(page, rate);
    this.#updateSelectedPageTimeouts();
  }

  getCpuThrottlingRate(): number {
    const page = this.getSelectedPage();
    return this.#cpuThrottlingRateMap.get(page) ?? 1;
  }

  setIsRunningPerformanceTrace(x: boolean): void {
    this.#isRunningTrace = x;
  }

  isRunningPerformanceTrace(): boolean {
    return this.#isRunningTrace;
  }

  getDialog(): Dialog | undefined {
    return this.#dialog;
  }

  clearDialog(): void {
    this.#dialog = undefined;
  }

  getSelectedPage(): Page {
    const page = this.#pages[this.#selectedPageIdx];
    if (!page) {
      throw new Error('No page selected');
    }
    if (page.isClosed()) {
      throw new Error(
        `The selected page has been closed. Call ${pages.name} to see open pages.`,
      );
    }
    return page;
  }

  getPageByIdx(idx: number): Page {
    const pages = this.#pages;
    const page = pages[idx];
    if (!page) {
      throw new Error('No page found');
    }
    return page;
  }

  getSelectedPageIdx(): number {
    return this.#selectedPageIdx;
  }

  #dialogHandler = (dialog: Dialog): void => {
    this.#dialog = dialog;
  };

  setSelectedPageIdx(idx: number): void {
    // Remove dialog handler from old page if exists
    const oldPage = this.#pages[this.#selectedPageIdx];
    if (oldPage && !oldPage.isClosed()) {
      oldPage.off('dialog', this.#dialogHandler);
    }

    this.#selectedPageIdx = idx;

    // Add dialog handler to new page if exists
    const newPage = this.#pages[idx];
    if (newPage && !newPage.isClosed()) {
      newPage.on('dialog', this.#dialogHandler);
      this.#updateSelectedPageTimeouts();
    }
  }

  #updateSelectedPageTimeouts() {
    const page = this.getSelectedPage();
    // For waiters 5sec timeout should be sufficient.
    // Increased in case we throttle the CPU
    const cpuMultiplier = this.getCpuThrottlingRate();
    page.setDefaultTimeout(DEFAULT_TIMEOUT * cpuMultiplier);
    // 10sec should be enough for the load event to be emitted during
    // navigations.
    // Increased in case we throttle the network requests
    const networkMultiplier = getNetworkMultiplierFromString(
      this.getNetworkConditions(),
    );
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT * networkMultiplier);
  }

  getNavigationTimeout() {
    const page = this.getSelectedPage();
    return page.getDefaultNavigationTimeout();
  }

  async getElementByUid(uid: string): Promise<ElementHandle<Element>> {
    if (!this.#textSnapshot?.idToNode.size) {
      throw new Error('No snapshot found. Use browser_snapshot to capture one');
    }
    const [snapshotId] = uid.split('_');

    if (this.#textSnapshot.snapshotId !== snapshotId) {
      throw new Error(
        'This uid is coming from a stale snapshot. Call take_snapshot to get a fresh snapshot.',
      );
    }

    const node = this.#textSnapshot?.idToNode.get(uid);
    if (!node) {
      throw new Error('No such element found in the snapshot');
    }
    const handle = await node.elementHandle();
    if (!handle) {
      throw new Error('No such element found in the snapshot');
    }
    return handle;
  }

  /**
   * Creates a snapshot of the pages.
   */
  async createPagesSnapshot(): Promise<Page[]> {
    this.#pages = await this.browser.pages();
    return this.#pages;
  }

  getPages(): Page[] {
    return this.#pages;
  }

  /**
   * Creates a text snapshot of a page.
   */
  async createTextSnapshot(): Promise<void> {
    const page = this.getSelectedPage();
    const rootNode = await page.accessibility.snapshot();
    if (!rootNode) {
      return;
    }

    const snapshotId = this.#nextSnapshotId++;
    // Iterate through the whole accessibility node tree and assign node ids that
    // will be used for the tree serialization and mapping ids back to nodes.
    let idCounter = 0;
    const idToNode = new Map<string, TextSnapshotNode>();
    const assignIds = (node: SerializedAXNode): TextSnapshotNode => {
      const nodeWithId: TextSnapshotNode = {
        ...node,
        id: `${snapshotId}_${idCounter++}`,
        children: node.children
          ? node.children.map(child => assignIds(child))
          : [],
      };
      idToNode.set(nodeWithId.id, nodeWithId);
      return nodeWithId;
    };

    const rootNodeWithId = assignIds(rootNode);
    this.#textSnapshot = {
      root: rootNodeWithId,
      snapshotId: String(snapshotId),
      idToNode,
    };
  }

  getTextSnapshot(): TextSnapshot | null {
    return this.#textSnapshot;
  }

  async saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    mimeType: 'image/png' | 'image/jpeg',
  ): Promise<{filename: string}> {
    try {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'chrome-devtools-mcp-'),
      );
      const filename = path.join(
        dir,
        mimeType == 'image/png' ? `screenshot.png` : 'screenshot.jpg',
      );
      await fs.writeFile(path.join(dir, `screenshot.png`), data);
      return {filename};
    } catch (err) {
      this.logger(err);
      throw new Error('Could not save a screenshot to a file');
    }
  }

  storeTraceRecording(result: TraceResult): void {
    this.#traceResults.push(result);
  }

  recordedTraces(): TraceResult[] {
    return this.#traceResults;
  }

  getWaitForHelper(
    page: Page,
    cpuMultiplier: number,
    networkMultiplier: number,
  ) {
    return new WaitForHelper(page, cpuMultiplier, networkMultiplier);
  }

  waitForEventsAfterAction(action: () => Promise<unknown>): Promise<void> {
    const page = this.getSelectedPage();
    const cpuMultiplier = this.getCpuThrottlingRate();
    const networkMultiplier = getNetworkMultiplierFromString(
      this.getNetworkConditions(),
    );
    const waitForHelper = this.getWaitForHelper(
      page,
      cpuMultiplier,
      networkMultiplier,
    );
    return waitForHelper.waitForEventsAfterAction(action);
  }
}
