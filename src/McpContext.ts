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
  ConsoleMessage,
  Dialog,
  ElementHandle,
  HTTPRequest,
  Page,
  SerializedAXNode,
  PredefinedNetworkConditions,
} from 'puppeteer-core';

import {NetworkCollector, PageCollector} from './PageCollector.js';
import {listPages} from './tools/pages.js';
import {takeSnapshot} from './tools/snapshot.js';
import {CLOSE_PAGE_ERROR} from './tools/ToolDefinition.js';
import type {Context} from './tools/ToolDefinition.js';
import type {TraceResult} from './trace-processing/parse.js';
import {WaitForHelper} from './WaitForHelper.js';

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

function getExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpeg';
    case 'image/webp':
      return 'webp';
  }
  throw new Error(`No mapping for Mime type ${mimeType}.`);
}

export class McpContext implements Context {
  browser: Browser;
  logger: Debugger;

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

  private constructor(browser: Browser, logger: Debugger) {
    this.browser = browser;
    this.logger = logger;

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
          collect(event);
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

  static async from(browser: Browser, logger: Debugger) {
    const context = new McpContext(browser, logger);
    await context.#init();
    return context;
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
        `The selected page has been closed. Call ${listPages.name} to see open pages.`,
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
    const oldPage = this.getSelectedPage();
    oldPage.off('dialog', this.#dialogHandler);
    this.#selectedPageIdx = idx;
    const newPage = this.getSelectedPage();
    newPage.on('dialog', this.#dialogHandler);
    this.#updateSelectedPageTimeouts();
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
      throw new Error(
        `No snapshot found. Use ${takeSnapshot.name} to capture one.`,
      );
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
    const rootNode = await page.accessibility.snapshot({
      includeIframes: true,
    });
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
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): Promise<{filename: string}> {
    try {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'chrome-devtools-mcp-'),
      );

      const filename = path.join(
        dir,
        `screenshot.${getExtensionFromMimeType(mimeType)}`,
      );
      await fs.writeFile(filename, data);
      return {filename};
    } catch (err) {
      this.logger(err);
      throw new Error('Could not save a screenshot to a file', {cause: err});
    }
  }
  async saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}> {
    try {
      const filePath = path.resolve(filename);
      await fs.writeFile(filePath, data);
      return {filename};
    } catch (err) {
      this.logger(err);
      throw new Error('Could not save a screenshot to a file', {cause: err});
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
