/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {overrideDevToolsGlobals} from './devtools/DevtoolsUtils.js';
import type {
  HeapSnapshotManager,
  HeapSnapshotAggregateData,
  HeapSnapshotDiff,
  HeapSnapshotDetailedClassDiff,
  DuplicateStringGroup,
  HeapEdgesQueryOptions,
  HeapQueryOptions,
} from './processors/HeapSnapshotManager.js';
import {McpPage} from './McpPage.js';
import {type UncaughtError} from './collectors/PageCollector.js';
import {ServiceWorkerConsoleCollector} from './collectors/ServiceWorkerCollector.js';
import {
  Locator,
  Mutex,
  type Browser,
  type BrowserContext,
  type Connection,
  type ConsoleMessage,
  type GetPWAStateOptions,
  type InstallPWAOptions,
  type LaunchPWAOptions,
  type Page,
  type Protocol,
  type PWAState,
  type Target,
  type UninstallPWAOptions,
  type Extension,
  type Root,
  type DevTools,
} from './third_party/index.js';
import type {ParsedArguments} from './config/ConfigParser.js';
import type {ReadonlyServerConfig} from './config/ServerConfig.js';
import {ToolCategory} from './tools/categories.js';
import {
  CLOSE_PAGE_ERROR,
  isCapabilityEnabled,
  type BrowserlessContext,
  type CapabilityGate,
  type Context,
  type DevToolsData,
  type SupportedExtensions,
} from './tools/ToolDefinition.js';
import type {TraceResult} from './processors/PerformanceTrace.js';
import type {Logger} from './types.js';
import {McpWorker} from './McpWorker.js';
import {getTempFilePath, resolveCanonicalPath} from './utils/files.js';
import {escapeForLog} from './utils/logger.js';
import type {TaskQueue, TaskRunner} from './utils/TaskRunner.js';
import {isAllowedUrl} from './utils/url.js';

export interface McpContextOptions {
  config: ReadonlyServerConfig;
  // Custom navigation timeout in milliseconds to override default.
  navigationTimeout?: number;
  // Shared heap snapshot manager to preserve loaded snapshots across browser reconnects.
  heapSnapshotManager: HeapSnapshotManager;
  // Creates the context queue and the page queues.
  taskRunner: TaskRunner;
  // Returns the browser to use. Called by ensureBrowser(), so the browser
  // connection is only established once a tool needs it.
  getBrowser: () => Promise<Browser>;
}

interface FeatureController {
  gate: CapabilityGate;
  onDisable(context: McpContext): Promise<void> | void;
}

const FEATURE_CONTROLLERS: readonly FeatureController[] = [
  {
    gate: {category: ToolCategory.DEBUGGING},
    onDisable: context => context.releaseScreencasts(),
  },
  {
    gate: {category: ToolCategory.MEMORY, conditions: ['memoryDebugging']},
    onDisable: context => context.releaseHeapSnapshots(),
  },
  {
    gate: {category: ToolCategory.PERFORMANCE},
    onDisable: context => context.releasePerformanceTrace(),
  },
  {
    gate: {category: ToolCategory.DEBUGGING, conditions: ['devtoolsComments']},
    onDisable: context => context.releaseDevToolsComments(),
  },
];

// Page ids are handed out from a process-wide counter so they stay unique
// across all contexts, in particular across browser reconnects. An id issued
// before a reconnect then fails to resolve instead of hitting an unrelated
// page of the reconnected browser.
let nextPageId = 1;

export class McpContext implements Context, BrowserlessContext {
  logger: Logger;

  #browser?: Browser;
  // Initialization of #browser, settles once its browser-dependent state is
  // ready.
  #browserReady?: Promise<void>;
  // Whether a browser connection was established before, so that switching to
  // a new browser surfaces a reconnect notice.
  #hasConnected = false;

  // Maps LLM-provided isolatedContext name → Puppeteer BrowserContext.
  #isolatedContexts = new Map<string, BrowserContext>();
  // Auto-generated name counter for when no name is provided.
  #nextIsolatedContextId = 1;

  // Cached McpWorker per target, reused across snapshots (mirrors #mcpPages) so
  // referential identity holds and workers can carry per-worker state later.
  #workers = new Map<Target, McpWorker>();

  #mcpPages = new Map<Target, McpPage>();
  /**
   * Queue for the browser-wide state (page list, selected page, trace
   * state). Every page queue is a child of it, so a task on it waits for
   * every page task and blocks later page tasks.
   */
  readonly taskQueue: TaskQueue;
  #taskRunner: TaskRunner;
  #pageTaskQueues = new Map<number, TaskQueue>();
  /**
   * Serializes `createPagesSnapshot()`. Two tasks on different page queues
   * can call it at the same time.
   */
  #pagesSnapshotMutex = new Mutex();
  #selectedPage?: McpPage;
  #selectedPageFallback?: {wasClosed: boolean};
  #selectedPageFallbackRead = false;

  #serviceWorkerConsoleCollector?: ServiceWorkerConsoleCollector;

  #reconnectNotice = false;

  #traceResults: TraceResult[] = [];

  #locatorClass: typeof Locator;
  #config: ReadonlyServerConfig;
  #options: McpContextOptions;
  #heapSnapshotManager: HeapSnapshotManager;
  #roots: Root[] | undefined = undefined;

  private constructor(
    logger: Logger,
    options: McpContextOptions,
    locatorClass: typeof Locator,
  ) {
    overrideDevToolsGlobals({
      loadResource: (url: string) => {
        return this.loadResource(url);
      },
    });

    this.logger = logger;
    this.#locatorClass = locatorClass;
    this.#taskRunner = options.taskRunner;
    this.taskQueue = options.taskRunner.createQueue();
    this.#config = options.config;
    this.#options = options;
    this.#heapSnapshotManager = options.heapSnapshotManager;
  }

  /**
   * The browser of the current connection. Throws if no browser connection was
   * established yet, see {@link McpContext.ensureBrowser}.
   */
  get browser(): Browser {
    if (!this.#browser) {
      throw new Error('Not connected to a browser.');
    }
    return this.#browser;
  }

  #allMcpPages(): Set<McpPage> {
    const pages = new Set(this.#mcpPages.values());
    if (this.#selectedPage) {
      pages.add(this.#selectedPage);
    }
    return pages;
  }

  /**
   * Synchronizes browser/page state and releases state of capabilities that
   * transitioned from enabled to disabled after a config reload.
   */
  async onConfigChanged(previousArgs: ParsedArguments): Promise<void> {
    const nextArgs = this.#config.resolved;
    if (nextArgs.sourceMaps !== previousArgs.sourceMaps) {
      for (const mcpPage of this.#allMcpPages()) {
        mcpPage.syncSourceMaps();
      }
    }
    if (
      nextArgs.experimentalIncludeAllPages !==
      previousArgs.experimentalIncludeAllPages
    ) {
      await this.createPagesSnapshot();
    }
    for (const controller of FEATURE_CONTROLLERS) {
      if (
        isCapabilityEnabled(controller.gate, previousArgs) &&
        !isCapabilityEnabled(controller.gate, nextArgs)
      ) {
        await controller.onDisable(this);
      }
    }
  }

  /**
   * Stops and saves active screencast recordings across all pages when
   * screencast tools are disabled.
   */
  async releaseScreencasts(): Promise<void> {
    for (const mcpPage of this.#allMcpPages()) {
      const screenRecorderData = mcpPage.getScreenRecorder();
      if (!screenRecorderData) {
        continue;
      }
      const {recorder, filePath} = screenRecorderData;
      mcpPage.setScreenRecorder(null);
      try {
        await recorder.stop();
        this.logger?.(
          `The screencast recording was stopped and saved to ${filePath} because screencast tools were disabled.`,
        );
      } catch (err) {
        this.logger?.('Failed to stop the screencast recording', err);
      }
    }
  }

  /**
   * Closes all loaded heap snapshots when memory tools are disabled.
   */
  releaseHeapSnapshots(): void {
    if (this.#heapSnapshotManager.hasSnapshots()) {
      this.#heapSnapshotManager.dispose();
      this.logger?.(
        'Loaded heap snapshots were closed because memory tools were disabled.',
      );
    }
  }

  /**
   * Discards recorded performance traces and stops any running trace when
   * performance tools are disabled.
   */
  async releasePerformanceTrace(): Promise<void> {
    this.#traceResults = [];
    for (const mcpPage of this.#allMcpPages()) {
      if (!mcpPage.isRunningPerformanceTrace()) {
        continue;
      }
      mcpPage.setIsRunningPerformanceTrace(false);
      try {
        await mcpPage.pptrPage.tracing.stop();
      } catch (err) {
        this.logger?.('Failed to stop the performance trace', err);
      }
      this.logger?.(
        'The running performance trace was discarded because performance tools were disabled.',
      );
    }
  }

  /**
   * Disposes DevTools comment bridges across all pages when DevTools comment
   * tools are disabled.
   */
  releaseDevToolsComments(): void {
    for (const mcpPage of this.#allMcpPages()) {
      mcpPage.disposeCommentBridge();
    }
  }

  /**
   * Returns the browser, establishing the connection if needed. If the browser
   * changed since the last call (e.g. after a reconnect), all
   * browser-dependent state is rebuilt for the new browser.
   */
  async ensureBrowser(): Promise<Browser> {
    const browser = await this.#options.getBrowser();
    if (browser === this.#browser && this.#browserReady) {
      // Joins a still pending initialization instead of handing out
      // half-initialized state.
      await this.#browserReady;
      return browser;
    }

    this.#resetBrowserState();
    this.#browser = browser;
    const ready = this.#initBrowserState(browser);
    this.#browserReady = ready;
    try {
      await ready;
      return browser;
    } catch (err) {
      // Leave no half-initialized state behind, the next call starts over. If
      // a later call already installed another browser, its state is left
      // intact.
      if (this.#browserReady === ready) {
        this.#resetBrowserState();
      }
      throw err;
    }
  }

  async #initBrowserState(browser: Browser): Promise<void> {
    const collector = new ServiceWorkerConsoleCollector(browser);
    this.#serviceWorkerConsoleCollector = collector;
    // All listeners are registered synchronously, before the first await. If
    // this call hangs and is abandoned by the tool-call timeout, a later call
    // that installs a different browser removes them in #resetBrowserState().
    browser.on('targetcreated', this.#onTargetCreated);
    browser.on('targetdestroyed', this.#onTargetDestroyed);
    await Promise.all([
      collector.init(this.createWorkersSnapshot()),
      this.createPagesSnapshot(),
    ]);
    // The state now belongs to the browser of a later call, leave it intact.
    if (this.#browser !== browser) {
      throw new Error('Browser was replaced while initializing.');
    }

    if (this.#hasConnected) {
      this.#reconnectNotice = true;
    }
    this.#hasConnected = true;
  }

  #resetBrowserState(): void {
    this.#browser?.off('targetcreated', this.#onTargetCreated);
    this.#browser?.off('targetdestroyed', this.#onTargetDestroyed);

    this.#serviceWorkerConsoleCollector?.dispose();
    for (const mcpPage of this.#allMcpPages()) {
      this.#disposeMcpPage(mcpPage);
    }
    this.#mcpPages.clear();
    this.#workers.clear();
    // Isolated contexts are intentionally not closed here.
    // Either the entire browser will be closed or we disconnect
    // without destroying browser state.
    this.#isolatedContexts.clear();
    this.#nextIsolatedContextId = 1;
    this.#selectedPage = undefined;
    this.#selectedPageFallback = undefined;
    this.#selectedPageFallbackRead = false;
    this.#traceResults = [];
    this.#serviceWorkerConsoleCollector = undefined;
    this.#browser = undefined;
    this.#browserReady = undefined;
  }

  dispose(): void {
    this.#resetBrowserState();
  }

  #onTargetCreated = (target: Target): void => {
    try {
      if (!this.#isPageTarget(target)) {
        return;
      }
      this.#createMcpPage(target);
    } catch (err) {
      this.logger?.('Error handling targetcreated', err);
    }
  };

  #onTargetDestroyed = (target: Target): void => {
    try {
      const mcpPage = this.#mcpPages.get(target);
      if (mcpPage) {
        this.#disposeMcpPage(mcpPage);
        this.#mcpPages.delete(target);
      }
      this.#workers.delete(target);
    } catch (err) {
      this.logger?.('Error handling targetdestroyed', err);
    }
  };

  static create(
    logger: Logger,
    opts: McpContextOptions,
    /* Let tests use unbundled Locator class to avoid overly strict checks within puppeteer that fail when mixing bundled and unbundled class instances */
    locatorClass: typeof Locator = Locator,
  ): McpContext {
    return new McpContext(logger, opts, locatorClass);
  }

  static resetPageIdsForTesting(): void {
    nextPageId = 1;
  }

  static resetWorkerIdsForTesting(): void {
    McpWorker.resetIdsForTesting();
  }

  roots(): Root[] {
    return [
      ...(this.#roots ?? []),
      {
        uri: pathToFileURL(os.tmpdir()).href,
        name: 'temp',
      },
    ];
  }

  setRoots(roots: Root[] | undefined): void {
    this.#roots = roots;
  }

  /**
   * Validates that the filePath is allowed according to the roots configuration.
   * Tolerates if parts of the filePath do not exist yet but the file access to
   * the resolved should only be allowed without following symlinks.
   */
  async validatePath(filePath: string): Promise<string>;
  async validatePath(filePath?: undefined): Promise<undefined>;
  async validatePath(filePath?: string): Promise<string | undefined>;
  async validatePath(filePath?: string): Promise<string | undefined> {
    if (filePath === undefined) {
      return undefined;
    }

    let canonicalPath: string;

    try {
      canonicalPath = await resolveCanonicalPath(filePath);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[MCP Context] Error resolving real path for ${escapeForLog(filePath)}: ${escapeForLog(errMsg)}`,
      );
      throw new Error(
        `Access denied: Cannot resolve base path for ${escapeForLog(filePath)}.`,
      );
    }

    // If the client never negotiated roots and the operator has explicitly
    // opted into unrestricted access via --allow-unrestricted-paths, restore
    // the previous permissive behavior and skip validation.
    if (
      this.#roots === undefined &&
      this.#config.resolved.allowUnrestrictedPaths
    ) {
      // Canonical path might not exist yet so we fallback to
      // path.resolve(filePath). Consumers should not follow symlinks.
      return canonicalPath || path.resolve(filePath);
    }
    // roots() always returns at least the temp directory, even if the
    // connecting client never negotiated the optional `roots` capability.
    // Path validation must not be skipped just because no workspace roots
    // were configured.
    const roots = this.roots();

    let allowed = false;
    const resolvedRoots = await Promise.allSettled(
      roots.map(async root => {
        const rootPathUri = root.uri;
        const rootPath = path.resolve(fileURLToPath(rootPathUri));
        return await fs.realpath(rootPath);
      }),
    );

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      const result = resolvedRoots[i];

      if (result.status === 'fulfilled') {
        const canonicalRoot = result.value;
        if (
          canonicalPath === canonicalRoot ||
          canonicalPath.startsWith(canonicalRoot + path.sep)
        ) {
          allowed = true;
          break;
        }
      } else {
        const rootErr = result.reason;
        const errMsg =
          rootErr instanceof Error ? rootErr.message : String(rootErr);
        console.warn(
          `[MCP Context] Could not resolve configured root ${escapeForLog(root.uri)}: ${escapeForLog(errMsg)}`,
        );
        // Skip this root if it cannot be resolved.
      }
    }

    if (!allowed) {
      throw new Error(
        `Access denied: path ${escapeForLog(filePath)} (canonical: ${escapeForLog(canonicalPath)}) is not within any of the configured workspace roots.`,
      );
    }

    return canonicalPath || path.resolve(filePath);
  }

  async ensureExtension<Extension extends `.${string}`>(
    filePath: string,
    extension: Extension,
  ): Promise<`${string}${Extension}`> {
    const resolved = await this.validatePath(filePath);
    const currentExtension = path.extname(resolved);
    const outputPath: `${string}${Extension}` = `${resolved.slice(
      0,
      resolved.length - currentExtension.length,
    )}${extension}`;
    return outputPath;
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
      page = await ctx.newPage({background});
    } else {
      page = await this.browser.newPage({background});
    }
    const mcpPage = this.#createMcpPage(page.target());
    await mcpPage.init({emulateFocus: true});
    this.selectPage(mcpPage);
    await this.createPagesSnapshot();
    return mcpPage;
  }
  async closePage(pageId: number): Promise<void> {
    const page = this.getPageById(pageId);
    if (this.#mcpPages.size === 1) {
      throw new Error(CLOSE_PAGE_ERROR);
    }
    this.#mcpPages.delete(page.target);
    await page.close();
  }

  async installPWA(options: InstallPWAOptions): Promise<string> {
    try {
      return await this.browser.installPWA(options);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Couldn't fetch install info")
      ) {
        return await this.browser.installPWA(options);
      }
      throw error;
    }
  }

  uninstallPWA(options: UninstallPWAOptions): Promise<void> {
    return this.browser.uninstallPWA(options);
  }

  async launchPWA(options: LaunchPWAOptions): Promise<Page> {
    const page = await this.browser.launchPWA(options);
    if (!page.url() || page.url() === 'about:blank') {
      await page
        .waitForNavigation({
          timeout: this.#options.navigationTimeout ?? 10_000,
        })
        .catch(() => {
          // Ignore timeout if navigation already completed or failed.
        });
    }
    return page;
  }

  getPWAState(options: GetPWAStateOptions): Promise<PWAState> {
    return this.browser.getPWAState(options);
  }

  isRunningPerformanceTrace(): boolean {
    for (const mcpPage of this.#allMcpPages()) {
      if (mcpPage.isRunningPerformanceTrace()) {
        return true;
      }
    }
    return false;
  }

  isCruxEnabled(): boolean {
    return this.#config.resolved.performanceCrux;
  }

  getPages(): McpPage[] {
    return Array.from(this.#mcpPages.values());
  }

  /**
   * Fetches current target info for all targets from the browser, keyed by
   * target id. Unlike Puppeteer's cached target info, this reflects title
   * changes, which Chrome does not report via `Target.targetInfoChanged`.
   * Returns an empty map if the browser cannot be queried.
   */
  async getTargetInfos(): Promise<Map<string, Protocol.Target.TargetInfo>> {
    try {
      // @ts-expect-error use existing browser connection (internal Puppeteer API).
      const connection: Connection = this.browser._connection;
      const {targetInfos} = await connection.send('Target.getTargets');
      return new Map(targetInfos.map(info => [info.targetId, info]));
    } catch (err) {
      this.logger?.('Failed to fetch target infos', err);
      return new Map();
    }
  }

  getSelectedMcpPage(): McpPage {
    const page = this.#selectedPage;
    if (!page) {
      throw new Error('No page selected');
    }
    if (page.isClosed()) {
      throw new Error(
        'The selected page has been closed. Call list_pages to see open pages.',
      );
    }
    return page;
  }

  getSelectedMcpPageUrl(page?: McpPage): string | undefined {
    let targetPage = page;
    if (!targetPage) {
      try {
        targetPage = this.getSelectedMcpPage();
      } catch {
        return undefined;
      }
    }
    if (targetPage && !targetPage.isClosed()) {
      return targetPage.url();
    }
    return undefined;
  }

  async getDevToolsData(page?: McpPage): Promise<DevToolsData | undefined> {
    const targetPage = page ?? this.#selectedPage;
    if (!targetPage) {
      return undefined;
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<undefined>(resolve => {
      timeoutId = setTimeout(() => resolve(undefined), 500);
    });
    const dataPromise = targetPage.getDevToolsData();
    try {
      return await Promise.race([dataPromise, timeoutPromise]);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Returns true once after the browser connection was re-established with a
   * new browser, so the next response can surface a note. Cleared on first
   * call.
   */
  consumeReconnectNotice(): boolean {
    const notice = this.#reconnectNotice;
    this.#reconnectNotice = false;
    return notice;
  }

  getPageById(pageId: number): McpPage {
    const page = this.#mcpPages.values().find(mcpPage => mcpPage.id === pageId);
    if (!page) {
      throw new Error('No page found');
    }
    return page;
  }

  /**
   * The queue for tasks on page `pageId`. The queue exists before the page
   * does, so a tool call can enter it before the browser connects. It is a
   * child of {@link taskQueue}.
   */
  pageTaskQueue(pageId: number): TaskQueue {
    let queue = this.#pageTaskQueues.get(pageId);
    if (!queue) {
      queue = this.#taskRunner.createQueue(this.taskQueue);
      this.#pageTaskQueues.set(pageId, queue);
    }
    return queue;
  }

  #disposeMcpPage(mcpPage: McpPage): void {
    mcpPage.dispose();
    this.#pageTaskQueues
      .get(mcpPage.id)
      ?.dispose(new Error(`Page ${mcpPage.id} is closed.`));
    this.#pageTaskQueues.delete(mcpPage.id);
  }

  isPageSelected(page: McpPage): boolean {
    return this.#selectedPage === page;
  }

  selectPage(newPage: McpPage): void {
    this.#selectedPageFallback = undefined;
    this.#selectedPageFallbackRead = false;
    this.#selectPage(newPage);
  }

  #selectPage(newPage: McpPage): void {
    if (
      this.#selectedPage &&
      this.#selectedPage !== newPage &&
      !this.#mcpPages.has(this.#selectedPage.target)
    ) {
      this.#disposeMcpPage(this.#selectedPage);
    }
    this.#selectedPage = newPage;
    newPage.updateTimeouts();
  }

  /**
   * Returns details about the last page snapshot automatically replacing the
   * selection because the selected page disappeared from the page list, or
   * `undefined` if the snapshot left the selection intact. Cleared on the next
   * createPagesSnapshot() call after it has been read, or when selectPage() is
   * called explicitly.
   */
  getSelectedPageFallback(): {wasClosed: boolean} | undefined {
    this.#selectedPageFallbackRead = true;
    return this.#selectedPageFallback;
  }

  /**
   * Creates a snapshot of the tracked workers. Today this is limited to
   * extension service workers; the McpWorker abstraction lets dedicated and
   * shared workers join the same snapshot later without changing consumers.
   */
  createWorkersSnapshot(): McpWorker[] {
    const serviceWorkers = this.browser.targets().filter(target => {
      return (
        target.type() === 'service_worker' &&
        target.url().includes('chrome-extension://')
      );
    });

    // Reuse the existing McpWorker for a target; only mint one (and an id) for
    // targets seen for the first time.
    for (const target of serviceWorkers) {
      if (!this.#workers.has(target)) {
        this.#workers.set(target, McpWorker.create('service_worker', target));
      }
    }

    // Prune workers whose target is gone (mirrors #mcpPages pruning).
    const currentTargets = new Set(serviceWorkers);
    for (const target of this.#workers.keys()) {
      if (!currentTargets.has(target)) {
        this.#workers.delete(target);
      }
    }

    return Array.from(this.#workers.values());
  }

  getServiceWorkerConsoleData(
    serviceWorkerId: string,
  ): Array<ConsoleMessage | UncaughtError> {
    const worker = this.getWorkerById(serviceWorkerId);
    if (worker?.type !== 'service_worker') {
      throw new Error('Service worker not found.');
    }
    const extensionId = new URL(worker.url).hostname;
    return this.#serviceWorkerConsoleCollector?.getData(extensionId) ?? [];
  }

  #getBrowserContextToNameMap(): Map<BrowserContext, string> {
    // Build a reverse lookup from BrowserContext instance → name.
    const contextToName = new Map<BrowserContext, string>();
    for (const [name, ctx] of this.#isolatedContexts) {
      contextToName.set(ctx, name);
    }
    const defaultCtx = this.browser.defaultBrowserContext();
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
    return contextToName;
  }

  #createMcpPage(target: Target): McpPage {
    let mcpPage =
      this.#mcpPages.get(target) ??
      (this.#selectedPage?.target === target ? this.#selectedPage : undefined);
    if (!mcpPage) {
      mcpPage = new McpPage(target, nextPageId++, {
        config: this.#config,
        locatorClass: this.#locatorClass,
        isolatedContextName: this.#getBrowserContextToNameMap().get(
          target.browserContext(),
        ),
        navigationTimeout: this.#options.navigationTimeout,
      });
    }
    this.#mcpPages.set(target, mcpPage);
    return mcpPage;
  }

  async createPagesSnapshot(): Promise<McpPage[]> {
    if (!this.#browser) {
      return [];
    }
    using guard = await this.#pagesSnapshotMutex.acquire();
    const allTargets = this.#fetchPageTargets();

    for (const target of allTargets) {
      this.#createMcpPage(target);
    }

    // Prune orphaned #mcpPages entries (targets that no longer exist).
    const currentTargets = new Set(allTargets);
    for (const [target, mcpPage] of this.#mcpPages) {
      if (!currentTargets.has(target)) {
        if (mcpPage !== this.#selectedPage || mcpPage.isClosed()) {
          this.#disposeMcpPage(mcpPage);
        }
        this.#mcpPages.delete(target);
      }
    }

    const pages = Array.from(this.#mcpPages.values());

    // Only fall back when the selected page is actually gone or no longer
    // counts as a page, e.g. a background page after
    // experimentalIncludeAllPages was turned off. Gating on `isClosed()`
    // instead of `pages` membership avoids silently swapping a live page that
    // is momentarily missing from the snapshot.
    if (this.#selectedPageFallbackRead) {
      this.#selectedPageFallback = undefined;
      this.#selectedPageFallbackRead = false;
    }
    if (
      !this.#selectedPage ||
      this.#selectedPage.isClosed() ||
      !this.#isPageTarget(this.#selectedPage.target)
    ) {
      if (pages[0]) {
        // Record the automatic change so the response can surface it. Skipped on
        // first connect, when there was no prior selection to replace.
        if (this.#selectedPage) {
          this.#selectedPageFallback = {
            wasClosed: this.#selectedPage.isClosed(),
          };
        }
        this.#selectPage(pages[0]);
      } else if (this.#selectedPage) {
        const wasClosed = Boolean(this.#selectedPage.isClosed());
        if (!wasClosed) {
          this.#disposeMcpPage(this.#selectedPage);
        }
        this.#selectedPage = undefined;
        this.#selectedPageFallback = {wasClosed};
      }
    }

    if (this.#selectedPage && !this.#selectedPage.isClosed()) {
      // Automatic page snapshots must preserve real focus on untouched tabs.
      await this.#selectedPage.init({emulateFocus: false});
    }

    return pages;
  }

  #isPageTarget(target: Target): boolean {
    const existingMcpPage =
      this.#mcpPages.get(target) ??
      (this.#selectedPage?.target === target ? this.#selectedPage : undefined);
    const url = existingMcpPage ? existingMcpPage.url() : target.url();
    if (
      !this.#config.resolved.experimentalDevtools &&
      url.startsWith('devtools://')
    ) {
      return false;
    }
    if (
      !isAllowedUrl(url, {
        categoryExtensions: this.#config.resolved.categoryExtensions,
      })
    ) {
      return false;
    }
    const type = target.type();
    if (type === 'page') {
      return true;
    }
    if (
      this.#config.resolved.experimentalIncludeAllPages &&
      (type === 'background_page' || type === 'webview')
    ) {
      return true;
    }
    if (
      this.#config.resolved.experimentalDevtools &&
      type === 'other' &&
      url.startsWith('devtools://')
    ) {
      return true;
    }
    return false;
  }

  #fetchPageTargets(): Target[] {
    return this.browser.targets().filter(target => this.#isPageTarget(target));
  }

  getWorkers(): McpWorker[] {
    return Array.from(this.#workers.values());
  }

  getWorkerById(id: string): McpWorker | undefined {
    return this.#workers.values().find(worker => worker.id === id);
  }

  async #writeFile(
    filepath: string,
    data: Uint8Array<ArrayBufferLike>,
  ): Promise<void> {
    const resolved = await this.validatePath(filepath);

    try {
      await fs.mkdir(path.dirname(resolved), {recursive: true});
      // Open the file with flags to:
      // - O_WRONLY: Write-only
      // - O_CREAT: Create if it doesn't exist
      // - O_TRUNC: Truncate to zero length if it exists
      // - O_NOFOLLOW: DO NOT follow symlinks.
      // - 0o600: Permissions: read/write for owner, no permissions for others.
      await fs.writeFile(resolved, data, {
        flag:
          fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_TRUNC |
          fs.constants.O_NOFOLLOW,
        mode: 0o600,
      });
    } catch (err) {
      throw new Error(`Could not write ${escapeForLog(filepath)}`, {
        cause: err,
      });
    }
  }

  async saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}> {
    const filepath = await getTempFilePath(filename);
    await this.#writeFile(filepath, data);
    return {filepath};
  }

  async saveFile(
    data: Uint8Array<ArrayBufferLike>,
    clientProvidedFilePath: string,
    extension: SupportedExtensions,
  ): Promise<{filename: string}> {
    const filePath = await this.ensureExtension(
      clientProvidedFilePath,
      extension,
    );
    await this.#writeFile(filePath, data);
    return {filename: filePath};
  }

  storeTraceRecording(result: TraceResult): void {
    // Clear the trace results because we only consume the latest trace currently.
    this.#traceResults = [];
    this.#traceResults.push(result);
  }

  recordedTraces(): TraceResult[] {
    return this.#traceResults;
  }

  async installExtension(extensionPath: string): Promise<string> {
    const id = await Promise.race([
      this.browser.installExtension(extensionPath),
      new Promise<string>((_, rej) =>
        setTimeout(() => rej(new Error('Timeout installing extension')), 30000),
      ),
    ]);
    return id;
  }

  async uninstallExtension(id: string): Promise<void> {
    await Promise.race([
      this.browser.uninstallExtension(id),
      new Promise<void>((_, rej) =>
        setTimeout(
          () => rej(new Error('Timeout uninstalling extension')),
          30000,
        ),
      ),
    ]);
  }

  async triggerExtensionAction(id: string): Promise<void> {
    const extensions = await this.browser.extensions();
    const extension = extensions.get(id);
    if (!extension) {
      throw new Error(`Extension with ID ${id} not found.`);
    }
    const page = this.getSelectedMcpPage().pptrPage;
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
    filterName?: string,
    objectId?: number,
  ): Promise<HeapSnapshotAggregateData> {
    return await this.#heapSnapshotManager.getAggregates(
      filePath,
      filterName,
      objectId,
    );
  }

  async getHeapSnapshotDuplicateStrings(
    filePath: string,
  ): Promise<DuplicateStringGroup[]> {
    return await this.#heapSnapshotManager.getDuplicateStrings(filePath);
  }

  async queryHeapSnapshotObjects(
    filePath: string,
    options: HeapQueryOptions,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    return await this.#heapSnapshotManager.queryObjects(filePath, options);
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

  async getHeapSnapshotNativeContextSizes(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes> {
    return await this.#heapSnapshotManager.getNativeContextSizes(filePath);
  }

  async getHeapSnapshotRetainedByContextSummary(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary> {
    return await this.#heapSnapshotManager.getRetainedByContextSummary(
      filePath,
    );
  }

  async getHeapSnapshotNodesById(
    filePath: string,
    id: number,
    filterName?: string,
    objectId?: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    return await this.#heapSnapshotManager.getNodesById(
      filePath,
      id,
      filterName,
      objectId,
    );
  }

  async getHeapSnapshotRetainers(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    return await this.#heapSnapshotManager.getRetainers(filePath, nodeId);
  }

  async getHeapSnapshotObjectDetails(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo> {
    return await this.#heapSnapshotManager.getObjectInfo(filePath, nodeId);
  }

  async analyzeHeapSnapshotContexts(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult> {
    return await this.#heapSnapshotManager.analyzeContexts(filePath);
  }

  async closeHeapSnapshot(filePath: string): Promise<boolean> {
    return await this.#heapSnapshotManager.disposeSnapshot(filePath);
  }

  async getHeapSnapshotRetainingPaths(
    filePath: string,
    nodeId: number,
    maxDepth?: number,
    maxNodes?: number,
    maxSiblings?: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths> {
    return await this.#heapSnapshotManager.getRetainingPaths(
      filePath,
      nodeId,
      maxDepth,
      maxNodes,
      maxSiblings,
    );
  }

  async getHeapSnapshotDominators(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain> {
    return await this.#heapSnapshotManager.getDominatorsOf(filePath, nodeId);
  }

  #validateUrlNotBlocked(url: URL): void {
    const blocklist = this.#config.resolved.blockedUrlPattern;
    if (!blocklist) {
      return;
    }
    for (const block of blocklist) {
      const pattern = new URLPattern(block);
      if (pattern.test(url)) {
        throw new Error(`Blocked by blocklist: ${url}`);
      }
    }
  }

  #validateUrlAllowed(url: URL): void {
    const allowlist = this.#config.resolved.allowedUrlPattern;
    if (!allowlist) {
      return;
    }
    for (const allow of allowlist) {
      const pattern = new URLPattern(allow);
      if (pattern.test(url)) {
        return;
      }
    }
    throw new Error(`Not allowed by allowlist: ${url}`);
  }

  async #loadNetworkResource(url: URL): Promise<string> {
    const redirectStatuses = new Set([301, 302, 303, 307, 308]);
    const maxRedirects = 20;
    let currentUrl = url;

    for (let redirectCount = 0; ; redirectCount++) {
      this.#validateUrlNotBlocked(currentUrl);
      this.#validateUrlAllowed(currentUrl);

      const response = await fetch(currentUrl, {redirect: 'manual'});
      if (!redirectStatuses.has(response.status)) {
        if (!response.ok) {
          throw new Error(`Failed to load resource: ${currentUrl}`);
        }
        return await response.text();
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Failed to load resource: ${currentUrl}`);
      }
      if (redirectCount >= maxRedirects) {
        throw new Error(`Too many redirects loading resource: ${url}`);
      }

      await response.body?.cancel();
      currentUrl = new URL(location, currentUrl);
      if (currentUrl.protocol !== 'https:' && currentUrl.protocol !== 'http:') {
        throw new Error(`Unsupported protocol for: ${currentUrl}`);
      }
    }
  }

  async loadResource(path: string): Promise<string> {
    const url = new URL(path);

    this.#validateUrlNotBlocked(url);

    switch (url.protocol) {
      case 'https:':
      case 'http:': {
        return await this.#loadNetworkResource(url);
      }

      case 'file:': {
        const resolved = await this.validatePath(fileURLToPath(url));
        return await fs.readFile(resolved, 'utf-8');
      }

      default:
        throw new Error(`Unsupported protocol for: ${url}`);
    }
  }

  async getHeapSnapshotEdges(
    filePath: string,
    nodeId: number,
    options?: HeapEdgesQueryOptions,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange> {
    return await this.#heapSnapshotManager.getEdges(filePath, nodeId, options);
  }

  async getHeapSnapshotClassDiffs(
    baseFilePath: string,
    currentFilePath: string,
  ): Promise<HeapSnapshotDiff> {
    return await this.#heapSnapshotManager.getClassDiffs(
      baseFilePath,
      currentFilePath,
    );
  }

  async getHeapSnapshotDetailedClassDiff(
    baseFilePath: string,
    currentFilePath: string,
    classIndex: number,
  ): Promise<HeapSnapshotDetailedClassDiff> {
    return await this.#heapSnapshotManager.getDetailedClassDiff(
      baseFilePath,
      currentFilePath,
      classIndex,
    );
  }
}
