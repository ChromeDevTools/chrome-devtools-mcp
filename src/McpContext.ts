/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import type {TargetUniverse} from './DevtoolsUtils.js';
import {UniverseManager} from './DevtoolsUtils.js';
import {HeapSnapshotManager} from './HeapSnapshotManager.js';
import type {AggregatedInfoWithUid} from './HeapSnapshotManager.js';
import {McpPage} from './McpPage.js';
import {
  NetworkCollector,
  ConsoleCollector,
  type ListenerMap,
  type UncaughtError,
} from './PageCollector.js';
import type {
  Browser,
  BrowserContext,
  ConsoleMessage,
  Debugger,
  HTTPRequest,
  Page,
  ScreenRecorder,
  Viewport,
  Target,
  Extension,
} from './third_party/index.js';
import type {DevTools} from './third_party/index.js';
import {Locator} from './third_party/index.js';
import {PredefinedNetworkConditions} from './third_party/index.js';
import {listPages} from './tools/pages.js';
import {CLOSE_PAGE_ERROR} from './tools/ToolDefinition.js';
import type {Context, SupportedExtensions} from './tools/ToolDefinition.js';
import type {TraceResult} from './trace-processing/parse.js';
import type {
  EmulationSettings,
  GeolocationOptions,
  ExtensionServiceWorker,
} from './types.js';
import {ensureExtension, saveTemporaryFile} from './utils/files.js';
import {getNetworkMultiplierFromString} from './WaitForHelper.js';

interface McpContextOptions {
  // Whether the DevTools windows are exposed as pages for debugging of DevTools.
  experimentalDevToolsDebugging: boolean;
  // Whether all page-like targets are exposed as pages.
  experimentalIncludeAllPages?: boolean;
  // Whether CrUX data should be fetched.
  performanceCrux: boolean;
}

const DEFAULT_TIMEOUT = 5_000;
const NAVIGATION_TIMEOUT = 10_000;

export class McpContext implements Context {
  browser: Browser;
  logger: Debugger;

  // Maps LLM-provided isolatedContext name → Puppeteer BrowserContext.
  #isolatedContexts = new Map<string, BrowserContext>();
  // Auto-generated name counter for when no name is provided.
  #nextIsolatedContextId = 1;

  #pages: Page[] = [];
  #extensionServiceWorkers: ExtensionServiceWorker[] = [];

  #mcpPages = new Map<Page, McpPage>();
  #selectedPage?: McpPage;
  #networkCollector: NetworkCollector;
  #consoleCollector: ConsoleCollector;
  #devtoolsUniverseManager: UniverseManager;

  #isRunningTrace = false;
  #screenRecorderData: {recorder: ScreenRecorder; filePath: string} | null =
    null;

  #nextPageId = 1;
  #extensionPages = new WeakMap<Target, Page>();

  #extensionServiceWorkerMap = new WeakMap<Target, string>();
  #nextExtensionServiceWorkerId = 1;

  #traceResults: TraceResult[] = [];

  #locatorClass: typeof Locator;
  #options: McpContextOptions;
  #heapSnapshotManager = new HeapSnapshotManager();

  private constructor(
    browser: Browser,
    logger: Debugger,
    options: McpContextOptions,
    locatorClass: typeof Locator,
  ) {
    this.browser = browser;
    this.logger = logger;
    this.#locatorClass = locatorClass;
    this.#options = options;

    this.#networkCollector = new NetworkCollector(this.browser);

    this.#consoleCollector = new ConsoleCollector(this.browser, collect => {
      return {
        console: event => {
          collect(event);
        },
        uncaughtError: event => {
          collect(event);
        },
        devtoolsAggregatedIssue: event => {
          collect(event);
        },
      } as ListenerMap;
    });
    this.#devtoolsUniverseManager = new UniverseManager(this.browser);
  }

  async #init() {
    const pages = await this.createPagesSnapshot();
    await this.createExtensionServiceWorkersSnapshot();
    await this.#networkCollector.init(pages);
    await this.#consoleCollector.init(pages);
    await this.#devtoolsUniverseManager.init(pages);
  }

  dispose() {
    this.#networkCollector.dispose();
    this.#consoleCollector.dispose();
    this.#devtoolsUniverseManager.dispose();
    for (const mcpPage of this.#mcpPages.values()) {
      mcpPage.dispose();
    }
    this.#mcpPages.clear();
    // Isolated contexts are intentionally not closed here.
    // Either the entire browser will be closed or we disconnect
    // without destroying browser state.
    this.#isolatedContexts.clear();
  }

  static async from(
    browser: Browser,
    logger: Debugger,
    opts: McpContextOptions,
    /* Let tests use unbundled Locator class to avoid overly strict checks within puppeteer that fail when mixing bundled and unbundled class instances */
    locatorClass: typeof Locator = Locator,
  ) {
    const context = new McpContext(browser, logger, opts, locatorClass);
    await context.#init();
    return context;
  }

  resolveCdpRequestId(page: McpPage, cdpRequestId: string): number | undefined {
    if (!cdpRequestId) {
      this.logger('no network request');
      return;
    }
    const request = this.#networkCollector.find(page.pptrPage, request => {
      // @ts-expect-error id is internal.
      return request.id === cdpRequestId;
    });
    if (!request) {
      this.logger('no network request for ' + cdpRequestId);
      return;
    }
    return this.#networkCollector.getIdForResource(request);
  }

  getNetworkRequests(
    page: McpPage,
    includePreservedRequests?: boolean,
  ): HTTPRequest[] {
    return this.#networkCollector.getData(
      page.pptrPage,
      includePreservedRequests,
    );
  }

  getConsoleData(
    page: McpPage,
    includePreservedMessages?: boolean,
  ): Array<ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError> {
    return this.#consoleCollector.getData(
      page.pptrPage,
      includePreservedMessages,
    );
  }

  getDevToolsUniverse(page: McpPage): TargetUniverse | null {
    return this.#devtoolsUniverseManager.get(page.pptrPage);
  }

  getConsoleMessageStableId(
    message: ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError,
  ): number {
    return this.#consoleCollector.getIdForResource(message);
  }

  getConsoleMessageById(
    page: McpPage,
    id: number,
  ): ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError {
    return this.#consoleCollector.getById(page.pptrPage, id);
  }

  async newPage(
    background?: boolean,
    isolatedContextName?: string,
  ): Promise<McpPage> {
    let page: Page;
    if (isolatedContextName !== undefined) {
      let ctx = this.#isolatedContexts.get(isolatedContextName);
      if (!ctx) {
        ctx = await this.browser.createBrowserContext();
        this.#isolatedContexts.set(isolatedContextName, ctx);
      }
      page = await ctx.newPage();
    } else {
      page = await this.browser.newPage({background});
    }
    await this.createPagesSnapshot();
    this.selectPage(this.#getMcpPage(page));
    this.#networkCollector.addPage(page);
    this.#consoleCollector.addPage(page);
    return this.#getMcpPage(page);
  }
  async closePage(pageId: number): Promise<void> {
    if (this.#pages.length === 1) {
      throw new Error(CLOSE_PAGE_ERROR);
    }
    const page = this.getPageById(pageId);
    if (page) {
      page.dispose();
      this.#mcpPages.delete(page.pptrPage);
    }
    await page.pptrPage.close({runBeforeUnload: false});
  }

  getNetworkRequestById(page: McpPage, reqid: number): HTTPRequest {
    return this.#networkCollector.getById(page.pptrPage, reqid);
  }

  async restoreEmulation(page: McpPage) {
    const currentSetting = page.emulationSettings;
    await this.emulate(currentSetting, page.pptrPage);
  }

  async emulate(
    options: {
      networkConditions?: string;
      cpuThrottlingRate?: number;
      geolocation?: GeolocationOptions;
      userAgent?: string;
      colorScheme?: 'dark' | 'light' | 'auto';
      viewport?: Viewport;
    },
    targetPage?: Page,
  ): Promise<void> {
    const page = targetPage ?? this.getSelectedPptrPage();
    const mcpPage = this.#getMcpPage(page);
    const newSettings: EmulationSettings = {...mcpPage.emulationSettings};

    if (!options.networkConditions) {
      await page.emulateNetworkConditions(null);
      delete newSettings.networkConditions;
    } else if (options.networkConditions === 'Offline') {
      await page.emulateNetworkConditions({
        offline: true,
        download: 0,
        upload: 0,
        latency: 0,
      });
      newSettings.networkConditions = 'Offline';
    } else if (options.networkConditions in PredefinedNetworkConditions) {
      const networkCondition =
        PredefinedNetworkConditions[
          options.networkConditions as keyof typeof PredefinedNetworkConditions
        ];
      await page.emulateNetworkConditions(networkCondition);
      newSettings.networkConditions = options.networkConditions;
    }

    if (!options.cpuThrottlingRate) {
      await page.emulateCPUThrottling(1);
      delete newSettings.cpuThrottlingRate;
    } else {
      await page.emulateCPUThrottling(options.cpuThrottlingRate);
      newSettings.cpuThrottlingRate = options.cpuThrottlingRate;
    }

    if (!options.geolocation) {
      await page.setGeolocation({latitude: 0, longitude: 0});
      delete newSettings.geolocation;
    } else {
      await page.setGeolocation(options.geolocation);
      newSettings.geolocation = options.geolocation;
    }

    if (!options.userAgent) {
      await page.setUserAgent({userAgent: undefined});
      delete newSettings.userAgent;
    } else {
      await page.setUserAgent({userAgent: options.userAgent});
      newSettings.userAgent = options.userAgent;
    }

    if (!options.colorScheme || options.colorScheme === 'auto') {
      await page.emulateMediaFeatures([
        {name: 'prefers-color-scheme', value: ''},
      ]);
      delete newSettings.colorScheme;
    } else {
      await page.emulateMediaFeatures([
        {name: 'prefers-color-scheme', value: options.colorScheme},
      ]);
      newSettings.colorScheme = options.colorScheme;
    }

    if (!options.viewport) {
      await page.setViewport(null);
      delete newSettings.viewport;
    } else {
      const defaults = {
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      };
      const viewport = {...defaults, ...options.viewport};
      await page.setViewport(viewport);
      newSettings.viewport = viewport;
    }

    mcpPage.emulationSettings = Object.keys(newSettings).length
      ? newSettings
      : {};

    this.#updateSelectedPageTimeouts();
  }

  setIsRunningPerformanceTrace(x: boolean): void {
    this.#isRunningTrace = x;
  }

  isRunningPerformanceTrace(): boolean {
    return this.#isRunningTrace;
  }

  getScreenRecorder(): {recorder: ScreenRecorder; filePath: string} | null {
    return this.#screenRecorderData;
  }

  setScreenRecorder(
    data: {recorder: ScreenRecorder; filePath: string} | null,
  ): void {
    this.#screenRecorderData = data;
  }

  isCruxEnabled(): boolean {
    return this.#options.performanceCrux;
  }

  getSelectedPptrPage(): Page {
    const page = this.#selectedPage;
    if (!page) {
      throw new Error('No page selected');
    }
    if (page.pptrPage.isClosed()) {
      throw new Error(
        `The selected page has been closed. Call ${listPages().name} to see open pages.`,
      );
    }
    return page.pptrPage;
  }

  getSelectedMcpPage(): McpPage {
    const page = this.getSelectedPptrPage();
    return this.#getMcpPage(page);
  }

  getPageById(pageId: number): McpPage {
    const page = this.#mcpPages.values().find(mcpPage => mcpPage.id === pageId);
    if (!page) {
      throw new Error('No page found');
    }
    return page;
  }

  getPageId(page: Page): number | undefined {
    return this.#mcpPages.get(page)?.id;
  }

  #getMcpPage(page: Page): McpPage {
    const mcpPage = this.#mcpPages.get(page);
    if (!mcpPage) {
      throw new Error('No McpPage found for the given page.');
    }
    return mcpPage;
  }

  #getSelectedMcpPage(): McpPage {
    return this.#getMcpPage(this.getSelectedPptrPage());
  }

  isPageSelected(page: Page): boolean {
    return this.#selectedPage?.pptrPage === page;
  }

  selectPage(newPage: McpPage): void {
    this.#selectedPage = newPage;
    this.#updateSelectedPageTimeouts();
  }

  #updateSelectedPageTimeouts() {
    const page = this.#getSelectedMcpPage();
    // For waiters 5sec timeout should be sufficient.
    // Increased in case we throttle the CPU
    const cpuMultiplier = page.cpuThrottlingRate;
    page.pptrPage.setDefaultTimeout(DEFAULT_TIMEOUT * cpuMultiplier);
    // 10sec should be enough for the load event to be emitted during
    // navigations.
    // Increased in case we throttle the network requests
    const networkMultiplier = getNetworkMultiplierFromString(
      page.networkConditions,
    );
    page.pptrPage.setDefaultNavigationTimeout(
      NAVIGATION_TIMEOUT * networkMultiplier,
    );
  }

  // Linear scan over per-page snapshots. The page count is small (typically
  // 2-10) so a reverse index isn't worthwhile given the uid-reuse lifecycle
  // complexity it would introduce.
  getAXNodeByUid(uid: string) {
    for (const mcpPage of this.#mcpPages.values()) {
      const node = mcpPage.textSnapshot?.idToNode.get(uid);
      if (node) {
        return node;
      }
    }
    return undefined;
  }

  /**
   * Creates a snapshot of the extension service workers.
   */
  async createExtensionServiceWorkersSnapshot(): Promise<
    ExtensionServiceWorker[]
  > {
    const allTargets = await this.browser.targets();

    const serviceWorkers = allTargets.filter(target => {
      return (
        target.type() === 'service_worker' &&
        target.url().includes('chrome-extension://')
      );
    });

    for (const serviceWorker of serviceWorkers) {
      if (!this.#extensionServiceWorkerMap.has(serviceWorker)) {
        this.#extensionServiceWorkerMap.set(
          serviceWorker,
          'sw-' + this.#nextExtensionServiceWorkerId++,
        );
      }
    }

    this.#extensionServiceWorkers = serviceWorkers.map(serviceWorker => {
      return {
        target: serviceWorker,
        id: this.#extensionServiceWorkerMap.get(serviceWorker)!,
        url: serviceWorker.url(),
      };
    });

    return this.#extensionServiceWorkers;
  }

  async createPagesSnapshot(): Promise<Page[]> {
    const {pages: allPages, isolatedContextNames} = await this.#getAllPages();

    for (const page of allPages) {
      let mcpPage = this.#mcpPages.get(page);
      if (!mcpPage) {
        mcpPage = new McpPage(page, this.#nextPageId++);
        this.#mcpPages.set(page, mcpPage);
        // We emulate a focused page for all pages to support multi-agent workflows.
        void page.emulateFocusedPage(true).catch(error => {
          this.logger('Error turning on focused page emulation', error);
        });
      }
      mcpPage.isolatedContextName = isolatedContextNames.get(page);
    }

    // Prune orphaned #mcpPages entries (pages that no longer exist).
    const currentPages = new Set(allPages);
    for (const [page, mcpPage] of this.#mcpPages) {
      if (!currentPages.has(page)) {
        mcpPage.dispose();
        this.#mcpPages.delete(page);
      }
    }

    this.#pages = allPages.filter(page => {
      return (
        this.#options.experimentalDevToolsDebugging ||
        !page.url().startsWith('devtools://')
      );
    });

    if (
      (!this.#selectedPage ||
        this.#pages.indexOf(this.#selectedPage.pptrPage) === -1) &&
      this.#pages[0]
    ) {
      this.selectPage(this.#getMcpPage(this.#pages[0]));
    }

    await this.detectOpenDevToolsWindows();

    return this.#pages;
  }

  async #getAllPages(): Promise<{
    pages: Page[];
    isolatedContextNames: Map<Page, string>;
  }> {
    const defaultCtx = this.browser.defaultBrowserContext();
    const allPages = await this.browser.pages(
      this.#options.experimentalIncludeAllPages,
    );

    const allTargets = this.browser.targets();
    const extensionTargets = allTargets.filter(target => {
      return (
        target.url().startsWith('chrome-extension://') &&
        target.type() === 'page'
      );
    });

    for (const target of extensionTargets) {
      // Right now target.page() returns null for popup and side panel pages.
      let page = await target.page();
      if (!page) {
        // We need to cache pages instances for targets because target.asPage()
        // returns a new page instance every time.
        page = this.#extensionPages.get(target) ?? null;
        if (!page) {
          try {
            page = await target.asPage();
            this.#extensionPages.set(target, page);
          } catch (e) {
            this.logger('Failed to get page for extension target', e);
          }
        }
      }

      if (page && !allPages.includes(page)) {
        allPages.push(page);
      }
    }

    // Build a reverse lookup from BrowserContext instance → name.
    const contextToName = new Map<BrowserContext, string>();
    for (const [name, ctx] of this.#isolatedContexts) {
      contextToName.set(ctx, name);
    }

    // Auto-discover BrowserContexts not in our mapping (e.g., externally
    // created incognito contexts) and assign generated names.
    const knownContexts = new Set(this.#isolatedContexts.values());
    for (const ctx of this.browser.browserContexts()) {
      if (ctx !== defaultCtx && !ctx.closed && !knownContexts.has(ctx)) {
        const name = `isolated-context-${this.#nextIsolatedContextId++}`;
        this.#isolatedContexts.set(name, ctx);
        contextToName.set(ctx, name);
      }
    }

    // Map each page to its isolated context name (if any).
    const isolatedContextNames = new Map<Page, string>();
    for (const page of allPages) {
      const ctx = page.browserContext();
      const name = contextToName.get(ctx);
      if (name) {
        isolatedContextNames.set(page, name);
      }
    }

    return {pages: allPages, isolatedContextNames};
  }

  async detectOpenDevToolsWindows() {
    this.logger('Detecting open DevTools windows');
    const {pages} = await this.#getAllPages();

    await Promise.all(
      pages.map(async page => {
        const mcpPage = this.#mcpPages.get(page);
        if (!mcpPage) {
          return;
        }

        // Prior to Chrome 144.0.7559.59, the command fails,
        // Some Electron apps still use older version
        // Fall back to not exposing DevTools at all.
        try {
          if (await page.hasDevTools()) {
            mcpPage.devToolsPage = await page.openDevTools();
          } else {
            mcpPage.devToolsPage = undefined;
          }
        } catch {
          mcpPage.devToolsPage = undefined;
        }
      }),
    );
  }

  getExtensionServiceWorkers(): ExtensionServiceWorker[] {
    return this.#extensionServiceWorkers;
  }

  getExtensionServiceWorkerId(
    extensionServiceWorker: ExtensionServiceWorker,
  ): string | undefined {
    return this.#extensionServiceWorkerMap.get(extensionServiceWorker.target);
  }

  getPages(): Page[] {
    return this.#pages;
  }

  getIsolatedContextName(page: Page): string | undefined {
    return this.#mcpPages.get(page)?.isolatedContextName;
  }

  async saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}> {
    return await saveTemporaryFile(data, filename);
  }
  async saveFile(
    data: Uint8Array<ArrayBufferLike>,
    clientProvidedFilePath: string,
    extension: SupportedExtensions,
  ): Promise<{filename: string}> {
    try {
      const filePath = ensureExtension(
        path.resolve(clientProvidedFilePath),
        extension,
      );
      await fs.mkdir(path.dirname(filePath), {recursive: true});
      await fs.writeFile(filePath, data);
      return {filename: filePath};
    } catch (err) {
      this.logger(err);
      throw new Error('Could not save a file', {cause: err});
    }
  }

  storeTraceRecording(result: TraceResult): void {
    // Clear the trace results because we only consume the latest trace currently.
    this.#traceResults = [];
    this.#traceResults.push(result);
  }

  recordedTraces(): TraceResult[] {
    return this.#traceResults;
  }

  getNetworkRequestStableId(request: HTTPRequest): number {
    return this.#networkCollector.getIdForResource(request);
  }

  waitForTextOnPage(
    text: string[],
    timeout?: number,
    targetPage?: Page,
  ): Promise<Element> {
    const page = targetPage ?? this.getSelectedPptrPage();
    const frames = page.frames();

    let locator = this.#locatorClass.race(
      frames.flatMap(frame =>
        text.flatMap(value => [
          frame.locator(`aria/${value}`),
          frame.locator(`text/${value}`),
        ]),
      ),
    );

    if (timeout) {
      locator = locator.setTimeout(timeout);
    }

    return locator.wait();
  }

  /**
   * We need to ignore favicon request as they make our test flaky
   */
  async setUpNetworkCollectorForTesting() {
    this.#networkCollector = new NetworkCollector(this.browser, collect => {
      return {
        request: req => {
          if (req.url().includes('favicon.ico')) {
            return;
          }
          collect(req);
        },
      } as ListenerMap;
    });
    const {pages} = await this.#getAllPages();
    await this.#networkCollector.init(pages);
  }

  async installExtension(extensionPath: string): Promise<string> {
    const id = await this.browser.installExtension(extensionPath);
    return id;
  }

  async uninstallExtension(id: string): Promise<void> {
    await this.browser.uninstallExtension(id);
  }

  async triggerExtensionAction(id: string): Promise<void> {
    const extensions = await this.browser.extensions();
    const extension = extensions.get(id);
    if (!extension) {
      throw new Error(`Extension with ID ${id} not found.`);
    }
    const page = this.getSelectedPptrPage();
    await extension.triggerAction(page);
  }

  listExtensions(): Promise<Map<string, Extension>> {
    return this.browser.extensions();
  }

  async getExtension(id: string): Promise<Extension | undefined> {
    const pptrExtensions = await this.browser.extensions();
    return pptrExtensions.get(id);
  }

  async getHeapSnapshotAggregates(
    filePath: string,
  ): Promise<Record<string, AggregatedInfoWithUid>> {
    return await this.#heapSnapshotManager.getAggregates(filePath);
  }

  async getHeapSnapshotStats(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics> {
    return await this.#heapSnapshotManager.getStats(filePath);
  }

  async getHeapSnapshotStaticData(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null> {
    return await this.#heapSnapshotManager.getStaticData(filePath);
  }
}
