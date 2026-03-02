/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {TargetUniverse} from './DevtoolsUtils.js';
import {
  extractUrlLikeFromDevToolsTitle,
  UniverseManager,
  urlsEqual,
} from './DevtoolsUtils.js';
import {McpPage} from './McpPage.js';
import type {ListenerMap, UncaughtError} from './PageCollector.js';
import {NetworkCollector, ConsoleCollector} from './PageCollector.js';
import type {DevTools} from './third_party/index.js';
import type {
  Browser,
  BrowserContext,
  ConsoleMessage,
  Debugger,
  HTTPRequest,
  Page,
  ScreenRecorder,
  SerializedAXNode,
  Viewport,
  Target,
} from './third_party/index.js';
import {Locator} from './third_party/index.js';
import {PredefinedNetworkConditions} from './third_party/index.js';
import {listPages} from './tools/pages.js';
import {CLOSE_PAGE_ERROR} from './tools/ToolDefinition.js';
import type {Context, DevToolsData} from './tools/ToolDefinition.js';
import type {TraceResult} from './trace-processing/parse.js';
import type {
  EmulationSettings,
  GeolocationOptions,
  TextSnapshot,
  TextSnapshotNode,
  ExtensionServiceWorker,
} from './types.js';
import {
  ExtensionRegistry,
  type InstalledExtension,
} from './utils/ExtensionRegistry.js';
import {WaitForHelper} from './WaitForHelper.js';

export type {
  EmulationSettings,
  GeolocationOptions,
  TextSnapshot,
  TextSnapshotNode,
} from './types.js';

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
  #extensionRegistry = new ExtensionRegistry();

  #isRunningTrace = false;
  #screenRecorderData: {recorder: ScreenRecorder; filePath: string} | null =
    null;

  #nextPageId = 1;
  #extensionPages = new WeakMap<Target, Page>();

  #extensionServiceWorkerMap = new WeakMap<Target, string>();
  #nextExtensionServiceWorkerId = 1;

  #nextSnapshotId = 1;
  #traceResults: TraceResult[] = [];

  #locatorClass: typeof Locator;
  #options: McpContextOptions;

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
        issue: event => {
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

  resolveCdpElementId(
    page: McpPage,
    cdpBackendNodeId: number,
  ): string | undefined {
    if (!cdpBackendNodeId) {
      this.logger('no cdpBackendNodeId');
      return;
    }
    const snapshot = page.textSnapshot;
    if (!snapshot) {
      this.logger('no text snapshot');
      return;
    }
    // TODO: index by backendNodeId instead.
    const queue = [snapshot.root];
    while (queue.length) {
      const current = queue.pop()!;
      if (current.backendNodeId === cdpBackendNodeId) {
        return current.id;
      }
      for (const child of current.children) {
        queue.push(child);
      }
    }
    return;
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
      networkConditions?: string | null;
      cpuThrottlingRate?: number | null;
      geolocation?: GeolocationOptions | null;
      userAgent?: string | null;
      colorScheme?: 'dark' | 'light' | 'auto' | null;
      viewport?: Viewport | null;
    },
    targetPage?: Page,
  ): Promise<void> {
    const page = targetPage ?? this.getSelectedPptrPage();
    const mcpPage = this.#getMcpPage(page);
    const newSettings: EmulationSettings = {...mcpPage.emulationSettings};
    let timeoutsNeedUpdate = false;

    if (options.networkConditions !== undefined) {
      timeoutsNeedUpdate = true;
      if (
        options.networkConditions === null ||
        options.networkConditions === 'No emulation'
      ) {
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
    }

    if (options.cpuThrottlingRate !== undefined) {
      timeoutsNeedUpdate = true;
      if (options.cpuThrottlingRate === null) {
        await page.emulateCPUThrottling(1);
        delete newSettings.cpuThrottlingRate;
      } else {
        await page.emulateCPUThrottling(options.cpuThrottlingRate);
        newSettings.cpuThrottlingRate = options.cpuThrottlingRate;
      }
    }

    if (options.geolocation !== undefined) {
      if (options.geolocation === null) {
        await page.setGeolocation({latitude: 0, longitude: 0});
        delete newSettings.geolocation;
      } else {
        await page.setGeolocation(options.geolocation);
        newSettings.geolocation = options.geolocation;
      }
    }

    if (options.userAgent !== undefined) {
      if (options.userAgent === null) {
        await page.setUserAgent({userAgent: undefined});
        delete newSettings.userAgent;
      } else {
        await page.setUserAgent({userAgent: options.userAgent});
        newSettings.userAgent = options.userAgent;
      }
    }

    if (options.colorScheme !== undefined) {
      if (options.colorScheme === null || options.colorScheme === 'auto') {
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
    }

    if (options.viewport !== undefined) {
      if (options.viewport === null) {
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
    }

    mcpPage.emulationSettings = Object.keys(newSettings).length
      ? newSettings
      : {};

    if (timeoutsNeedUpdate) {
      this.#updateSelectedPageTimeouts();
    }
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

    const allTargets = this.browser.targets();
    const extensionTargets = allTargets.filter(target => {
      return (
        target.url().startsWith('chrome-extension://') &&
        (target.type() === 'page' || target.type() === 'other')
      );
    });

    for (const target of extensionTargets) {
      let page = await target.page();
      if (!page) {
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
    // Clear all devToolsPage references before re-detecting.
    for (const mcpPage of this.#mcpPages.values()) {
      mcpPage.devToolsPage = undefined;
    }
    for (const devToolsPage of pages) {
      if (devToolsPage.url().startsWith('devtools://')) {
        try {
          this.logger('Calling getTargetInfo for ' + devToolsPage.url());
          const data = await devToolsPage
            // @ts-expect-error no types for _client().
            ._client()
            .send('Target.getTargetInfo');
          const devtoolsPageTitle = data.targetInfo.title;
          const urlLike = extractUrlLikeFromDevToolsTitle(devtoolsPageTitle);
          if (!urlLike) {
            continue;
          }
          // TODO: lookup without a loop.
          for (const page of this.#pages) {
            if (urlsEqual(page.url(), urlLike)) {
              const mcpPage = this.#mcpPages.get(page);
              if (mcpPage) {
                mcpPage.devToolsPage = devToolsPage;
              }
            }
          }
        } catch (error) {
          this.logger('Issue occurred while trying to find DevTools', error);
        }
      }
    }
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

  getDevToolsPage(page: Page): Page | undefined {
    return this.#mcpPages.get(page)?.devToolsPage;
  }

  async getDevToolsData(page: McpPage): Promise<DevToolsData> {
    try {
      this.logger('Getting DevTools UI data');
      const devtoolsPage = this.getDevToolsPage(page.pptrPage);
      if (!devtoolsPage) {
        this.logger('No DevTools page detected');
        return {};
      }
      const {cdpRequestId, cdpBackendNodeId} = await devtoolsPage.evaluate(
        async () => {
          // @ts-expect-error no types
          const UI = await import('/bundled/ui/legacy/legacy.js');
          // @ts-expect-error no types
          const SDK = await import('/bundled/core/sdk/sdk.js');
          const request = UI.Context.Context.instance().flavor(
            SDK.NetworkRequest.NetworkRequest,
          );
          const node = UI.Context.Context.instance().flavor(
            SDK.DOMModel.DOMNode,
          );
          return {
            cdpRequestId: request?.requestId(),
            cdpBackendNodeId: node?.backendNodeId(),
          };
        },
      );
      return {cdpBackendNodeId, cdpRequestId};
    } catch (err) {
      this.logger('error getting devtools data', err);
    }
    return {};
  }

  /**
   * Creates a text snapshot of a page.
   */
  async createTextSnapshot(
    page: McpPage,
    verbose = false,
    devtoolsData: DevToolsData | undefined = undefined,
  ): Promise<void> {
    const rootNode = await page.pptrPage.accessibility.snapshot({
      includeIframes: true,
      interestingOnly: !verbose,
    });
    if (!rootNode) {
      return;
    }

    const {uniqueBackendNodeIdToMcpId} = page;

    const snapshotId = this.#nextSnapshotId++;
    // Iterate through the whole accessibility node tree and assign node ids that
    // will be used for the tree serialization and mapping ids back to nodes.
    let idCounter = 0;
    const idToNode = new Map<string, TextSnapshotNode>();
    const seenUniqueIds = new Set<string>();
    const assignIds = (node: SerializedAXNode): TextSnapshotNode => {
      let id = '';
      // @ts-expect-error untyped loaderId & backendNodeId.
      const uniqueBackendId = `${node.loaderId}_${node.backendNodeId}`;
      if (uniqueBackendNodeIdToMcpId.has(uniqueBackendId)) {
        // Re-use MCP exposed ID if the uniqueId is the same.
        id = uniqueBackendNodeIdToMcpId.get(uniqueBackendId)!;
      } else {
        // Only generate a new ID if we have not seen the node before.
        id = `${snapshotId}_${idCounter++}`;
        uniqueBackendNodeIdToMcpId.set(uniqueBackendId, id);
      }
      seenUniqueIds.add(uniqueBackendId);

      const nodeWithId: TextSnapshotNode = {
        ...node,
        id,
        children: node.children
          ? node.children.map(child => assignIds(child))
          : [],
      };

      // The AXNode for an option doesn't contain its `value`.
      // Therefore, set text content of the option as value.
      if (node.role === 'option') {
        const optionText = node.name;
        if (optionText) {
          nodeWithId.value = optionText.toString();
        }
      }

      idToNode.set(nodeWithId.id, nodeWithId);
      return nodeWithId;
    };

    const rootNodeWithId = assignIds(rootNode);
    const snapshot: TextSnapshot = {
      root: rootNodeWithId,
      snapshotId: String(snapshotId),
      idToNode,
      hasSelectedElement: false,
      verbose,
    };
    page.textSnapshot = snapshot;
    const data = devtoolsData ?? (await this.getDevToolsData(page));
    if (data?.cdpBackendNodeId) {
      snapshot.hasSelectedElement = true;
      snapshot.selectedElementUid = this.resolveCdpElementId(
        page,
        data?.cdpBackendNodeId,
      );
    }

    // Clean up unique IDs that we did not see anymore.
    for (const key of uniqueBackendNodeIdToMcpId.keys()) {
      if (!seenUniqueIds.has(key)) {
        uniqueBackendNodeIdToMcpId.delete(key);
      }
    }
  }

  async saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}> {
    try {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'chrome-devtools-mcp-'),
      );

      const filepath = path.join(dir, filename);
      await fs.writeFile(filepath, data);
      return {filepath};
    } catch (err) {
      this.logger(err);
      throw new Error('Could not save a file', {cause: err});
    }
  }
  async saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}> {
    try {
      const filePath = path.resolve(filename);
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

  getWaitForHelper(
    page: Page,
    cpuMultiplier: number,
    networkMultiplier: number,
  ) {
    return new WaitForHelper(page, cpuMultiplier, networkMultiplier);
  }

  waitForEventsAfterAction(
    action: () => Promise<unknown>,
    options?: {timeout?: number},
  ): Promise<void> {
    const page = this.#getSelectedMcpPage();
    const cpuMultiplier = page.cpuThrottlingRate;
    const networkMultiplier = getNetworkMultiplierFromString(
      page.networkConditions,
    );
    const waitForHelper = this.getWaitForHelper(
      page.pptrPage,
      cpuMultiplier,
      networkMultiplier,
    );
    return waitForHelper.waitForEventsAfterAction(action, options);
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
    await this.#extensionRegistry.registerExtension(id, extensionPath);
    return id;
  }

  async uninstallExtension(id: string): Promise<void> {
    await this.browser.uninstallExtension(id);
    this.#extensionRegistry.remove(id);
  }

  async triggerExtensionAction(id: string): Promise<void> {
    const page = this.getSelectedPptrPage();
    // @ts-expect-error internal puppeteer api is needed since we don't have a way to get
    // a tab id at the moment
    const theTarget = page._tabId;
    const session = await this.browser.target().createCDPSession();

    try {
      // @ts-expect-error triggerAction is not yet available
      await session.send('Extensions.triggerAction', {
        id,
        targetId: theTarget,
      });
    } finally {
      await session.detach();
    }
  }

  listExtensions(): InstalledExtension[] {
    return this.#extensionRegistry.list();
  }

  getExtension(id: string): InstalledExtension | undefined {
    return this.#extensionRegistry.getById(id);
  }
}
