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

/**
 * Represents a node in a text snapshot, extending a serialized accessibility node
 * with an ID and structured children.
 * @public
 */
export interface TextSnapshotNode extends SerializedAXNode {
  /**
   * The unique identifier for the node.
   */
  id: string;
  /**
   * The children of the node.
   */
  children: TextSnapshotNode[];
}

/**
 * Represents a full text snapshot of a page, including the root node, a map of
 * IDs to nodes, and the snapshot's unique ID.
 * @public
 */
export interface TextSnapshot {
  /**
   * The root node of the snapshot.
   */
  root: TextSnapshotNode;
  /**
   * A map from node IDs to the nodes themselves.
   */
  idToNode: Map<string, TextSnapshotNode>;
  /**
   * The unique identifier for the snapshot.
   */
  snapshotId: string;
}

const DEFAULT_TIMEOUT = 5_000;
const NAVIGATION_TIMEOUT = 10_000;

/**
 * Converts a network condition string to a multiplier for timeouts.
 *
 * @param condition - The network condition string.
 * @returns The timeout multiplier.
 */
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

/**
 * Gets the file extension for a given MIME type.
 *
 * @param mimeType - The MIME type.
 * @returns The corresponding file extension.
 * @throws If there is no mapping for the given MIME type.
 */
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

/**
 * Manages the context for the MCP server, including browser state, pages,
 * snapshots, and collectors.
 * @public
 */
export class McpContext implements Context {
  /**
   * The Puppeteer browser instance.
   */
  browser: Browser;
  /**
   * The logger for the context.
   */
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

  /**
   * Creates and initializes a new McpContext.
   *
   * @param browser - The Puppeteer browser instance.
   * @param logger - The logger for the context.
   * @returns A new, initialized McpContext.
   */
  static async from(browser: Browser, logger: Debugger) {
    const context = new McpContext(browser, logger);
    await context.#init();
    return context;
  }

  /**
   * Retrieves the network requests for the selected page.
   *
   * @returns An array of HTTP requests.
   */
  getNetworkRequests(): HTTPRequest[] {
    const page = this.getSelectedPage();
    return this.#networkCollector.getData(page);
  }

  /**
   * Retrieves the console data (messages and errors) for the selected page.
   *
   * @returns An array of console messages or errors.
   */
  getConsoleData(): Array<ConsoleMessage | Error> {
    const page = this.getSelectedPage();
    return this.#consoleCollector.getData(page);
  }

  /**
   * Creates a new page in the browser, sets it as the selected page, and adds
   * it to the collectors.
   *
   * @returns The newly created page.
   */
  async newPage(): Promise<Page> {
    const page = await this.browser.newPage();
    const pages = await this.createPagesSnapshot();
    this.setSelectedPageIdx(pages.indexOf(page));
    this.#networkCollector.addPage(page);
    this.#consoleCollector.addPage(page);
    return page;
  }

  /**
   * Closes a page by its index.
   *
   * @param pageIdx - The index of the page to close.
   * @throws If there is only one page open.
   */
  async closePage(pageIdx: number): Promise<void> {
    if (this.#pages.length === 1) {
      throw new Error(CLOSE_PAGE_ERROR);
    }
    const page = this.getPageByIdx(pageIdx);
    this.setSelectedPageIdx(0);
    await page.close({runBeforeUnload: false});
  }

  /**
   * Retrieves a network request by its URL.
   *
   * @param url - The URL of the request to find.
   * @returns The HTTP request.
   * @throws If no requests are found for the selected page or the specific
   * request is not found.
   */
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

  /**
   * Sets the network conditions for the selected page.
   *
   * @param conditions - The network conditions to set, or null to clear.
   */
  setNetworkConditions(conditions: string | null): void {
    const page = this.getSelectedPage();
    if (conditions === null) {
      this.#networkConditionsMap.delete(page);
    } else {
      this.#networkConditionsMap.set(page, conditions);
    }
    this.#updateSelectedPageTimeouts();
  }

  /**
   * Gets the network conditions for the selected page.
   *
   * @returns The current network conditions, or null if not set.
   */
  getNetworkConditions(): string | null {
    const page = this.getSelectedPage();
    return this.#networkConditionsMap.get(page) ?? null;
  }

  /**
   * Sets the CPU throttling rate for the selected page.
   *
   * @param rate - The CPU throttling rate.
   */
  setCpuThrottlingRate(rate: number): void {
    const page = this.getSelectedPage();
    this.#cpuThrottlingRateMap.set(page, rate);
    this.#updateSelectedPageTimeouts();
  }

  /**
   * Gets the CPU throttling rate for the selected page.
   *
   * @returns The current CPU throttling rate.
   */
  getCpuThrottlingRate(): number {
    const page = this.getSelectedPage();
    return this.#cpuThrottlingRateMap.get(page) ?? 1;
  }

  /**
   * Sets whether a performance trace is currently running.
   *
   * @param x - True if a trace is running, false otherwise.
   */
  setIsRunningPerformanceTrace(x: boolean): void {
    this.#isRunningTrace = x;
  }

  /**
   * Checks if a performance trace is currently running.
   *
   * @returns True if a trace is running, false otherwise.
   */
  isRunningPerformanceTrace(): boolean {
    return this.#isRunningTrace;
  }

  /**
   * Gets the current dialog, if any.
   *
   * @returns The current dialog, or undefined if none.
   */
  getDialog(): Dialog | undefined {
    return this.#dialog;
  }

  /**
   * Clears the current dialog.
   */
  clearDialog(): void {
    this.#dialog = undefined;
  }

  /**
   * Gets the currently selected page.
   *
   * @returns The selected page.
   * @throws If no page is selected or the selected page is closed.
   */
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

  /**
   * Gets a page by its index.
   *
   * @param idx - The index of the page to retrieve.
   * @returns The page at the specified index.
   * @throws If no page is found at the index.
   */
  getPageByIdx(idx: number): Page {
    const pages = this.#pages;
    const page = pages[idx];
    if (!page) {
      throw new Error('No page found');
    }
    return page;
  }

  /**
   * Gets the index of the currently selected page.
   *
   * @returns The index of the selected page.
   */
  getSelectedPageIdx(): number {
    return this.#selectedPageIdx;
  }

  #dialogHandler = (dialog: Dialog): void => {
    this.#dialog = dialog;
  };

  /**
   * Sets the selected page by its index.
   *
   * @param idx - The index of the page to select.
   */
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

  /**
   * Gets the navigation timeout for the selected page.
   *
   * @returns The navigation timeout in milliseconds.
   */
  getNavigationTimeout() {
    const page = this.getSelectedPage();
    return page.getDefaultNavigationTimeout();
  }

  /**
   * Retrieves an element by its unique ID from the text snapshot.
   *
   * @param uid - The unique ID of the element.
   * @returns A handle to the element.
   * @throws If no snapshot is found, the UID is from a stale snapshot, or the
   * element is not found.
   */
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
  /**
   * Creates a snapshot of the currently open pages.
   *
   * @returns A promise that resolves to an array of pages.
   */
  async createPagesSnapshot(): Promise<Page[]> {
    this.#pages = await this.browser.pages();
    return this.#pages;
  }

  /**
   * Gets the current list of pages.
   *
   * @returns An array of pages.
   */
  getPages(): Page[] {
    return this.#pages;
  }

  /**
   * Creates a text snapshot of a page.
   */
  /**
   * Creates a text snapshot of the selected page's accessibility tree.
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

  /**
   * Gets the current text snapshot.
   *
   * @returns The current text snapshot, or null if none exists.
   */
  getTextSnapshot(): TextSnapshot | null {
    return this.#textSnapshot;
  }

  /**
   * Saves data to a temporary file.
   *
   * @param data - The data to save.
   * @param mimeType - The MIME type of the data.
   * @returns An object containing the filename.
   * @throws If the file could not be saved.
   */
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
  /**
   * Saves data to a specified file.
   *
   * @param data - The data to save.
   * @param filename - The path to the file.
   * @returns An object containing the filename.
   * @throws If the file could not be saved.
   */
  async saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename:string}> {
    try {
      const filePath = path.resolve(filename);
      await fs.writeFile(filePath, data);
      return {filename};
    } catch (err) {
      this.logger(err);
      throw new Error('Could not save a screenshot to a file', {cause: err});
    }
  }

  /**
   * Stores the result of a trace recording.
   *
   * @param result - The trace result to store.
   */
  storeTraceRecording(result: TraceResult): void {
    this.#traceResults.push(result);
  }

  /**
   * Retrieves all recorded trace results.
   *
   * @returns An array of trace results.
   */
  recordedTraces(): TraceResult[] {
    return this.#traceResults;
  }

  /**
   * Gets a WaitForHelper instance for the given page and multipliers.
   *
   * @param page - The page to wait for events on.
   * @param cpuMultiplier - The CPU throttling multiplier.
   * @param networkMultiplier - The network throttling multiplier.
   * @returns A new WaitForHelper instance.
   */
  getWaitForHelper(
    page: Page,
    cpuMultiplier: number,
    networkMultiplier: number,
  ) {
    return new WaitForHelper(page, cpuMultiplier, networkMultiplier);
  }

  /**
   * Waits for events to settle after performing an action.
   *
   * @param action - The action to perform.
   * @returns A promise that resolves when events have settled.
   */
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
