/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HeapSnapshotManager, HeapSnapshotAggregateData, HeapSnapshotDiff, HeapSnapshotDetailedClassDiff, DuplicateStringGroup, HeapEdgesQueryOptions, HeapQueryOptions } from './processors/HeapSnapshotManager.js';
import { McpPage } from './McpPage.js';
import type { UncaughtError } from './collectors/PageCollector.js';
import { Locator, type Browser, type ConsoleMessage, type GetPWAStateOptions, type InstallPWAOptions, type LaunchPWAOptions, type Page, type Protocol, type PWAState, type UninstallPWAOptions, type Extension, type Root, type DevTools } from './third_party/index.js';
import type { ParsedArguments } from './config/mcp-options.js';
import type { ReadonlyServerConfig } from './config/ServerConfig.js';
import { type BrowserlessContext, type Context, type DevToolsData, type SupportedExtensions } from './tools/ToolDefinition.js';
import type { TraceResult } from './processors/PerformanceTrace.js';
import type { Logger } from './types.js';
import { McpWorker } from './McpWorker.js';
import type { TaskQueue, TaskRunner } from './utils/TaskRunner.js';
export interface McpContextOptions {
    config: ReadonlyServerConfig;
    navigationTimeout?: number;
    heapSnapshotManager: HeapSnapshotManager;
    taskRunner: TaskRunner;
    getBrowser: () => Promise<Browser>;
}
export declare class McpContext implements Context, BrowserlessContext {
    #private;
    logger: Logger;
    /**
     * Queue for the browser-wide state (page list, selected page, trace
     * state). Every page queue is a child of it, so a task on it waits for
     * every page task and blocks later page tasks.
     */
    readonly taskQueue: TaskQueue;
    private constructor();
    /**
     * The browser of the current connection. Throws if no browser connection was
     * established yet, see {@link McpContext.ensureBrowser}.
     */
    get browser(): Browser;
    /**
     * Synchronizes browser/page state and releases state of capabilities that
     * transitioned from enabled to disabled after a config reload.
     */
    onConfigChanged(previousArgs: ParsedArguments): Promise<void>;
    /**
     * Applies updated URL allowlist/blocklist rules to the connected browser and
     * clears incompatible page network throttling state.
     */
    syncNetworkRestrictions(): Promise<void>;
    /**
     * Synchronizes the DevTools source maps setting across all pages.
     */
    syncSourceMaps(): void;
    /**
     * Stops and saves active screencast recordings across all pages when
     * screencast tools are disabled.
     */
    releaseScreencasts(): Promise<void>;
    /**
     * Closes all loaded heap snapshots when memory tools are disabled.
     */
    releaseHeapSnapshots(): void;
    /**
     * Discards recorded performance traces and stops any running trace when
     * performance tools are disabled.
     */
    releasePerformanceTrace(): Promise<void>;
    /**
     * Disposes DevTools comment bridges across all pages when DevTools comment
     * tools are disabled.
     */
    releaseDevToolsComments(): void;
    /**
     * Returns the browser, establishing the connection if needed. If the browser
     * changed since the last call (e.g. after a reconnect), all
     * browser-dependent state is rebuilt for the new browser.
     */
    ensureBrowser(): Promise<Browser>;
    dispose(): void;
    static create(logger: Logger, opts: McpContextOptions, locatorClass?: typeof Locator): McpContext;
    static resetPageIdsForTesting(): void;
    static resetWorkerIdsForTesting(): void;
    roots(): Root[];
    setRoots(roots: Root[] | undefined): void;
    /**
     * Validates that the filePath is allowed according to the roots configuration.
     * Tolerates if parts of the filePath do not exist yet but the file access to
     * the resolved should only be allowed without following symlinks.
     */
    validatePath(filePath: string): Promise<string>;
    validatePath(filePath?: undefined): Promise<undefined>;
    validatePath(filePath?: string): Promise<string | undefined>;
    ensureExtension<Extension extends `.${string}`>(filePath: string, extension: Extension): Promise<`${string}${Extension}`>;
    newPage(background?: boolean, isolatedContextName?: string): Promise<McpPage>;
    closePage(pageId: number): Promise<void>;
    installPWA(options: InstallPWAOptions): Promise<string>;
    uninstallPWA(options: UninstallPWAOptions): Promise<void>;
    launchPWA(options: LaunchPWAOptions): Promise<Page>;
    getPWAState(options: GetPWAStateOptions): Promise<PWAState>;
    isRunningPerformanceTrace(): boolean;
    isCruxEnabled(): boolean;
    getPages(): McpPage[];
    /**
     * Fetches current target info for all targets from the browser, keyed by
     * target id. Unlike Puppeteer's cached target info, this reflects title
     * changes, which Chrome does not report via `Target.targetInfoChanged`.
     * Returns an empty map if the browser cannot be queried.
     */
    getTargetInfos(): Promise<Map<string, Protocol.Target.TargetInfo>>;
    getSelectedMcpPage(): McpPage;
    getSelectedMcpPageUrl(page?: McpPage): string | undefined;
    getDevToolsData(page?: McpPage): Promise<DevToolsData | undefined>;
    /**
     * Returns true once after the browser connection was re-established with a
     * new browser, so the next response can surface a note. Cleared on first
     * call.
     */
    consumeReconnectNotice(): boolean;
    getPageById(pageId: number): McpPage;
    /**
     * The queue for tasks on page `pageId`. The queue exists before the page
     * does, so a tool call can enter it before the browser connects. It is a
     * child of {@link taskQueue}.
     */
    pageTaskQueue(pageId: number): TaskQueue;
    isPageSelected(page: McpPage): boolean;
    selectPage(newPage: McpPage): void;
    /**
     * Returns details about the last page snapshot automatically replacing the
     * selection because the selected page disappeared from the page list, or
     * `undefined` if the snapshot left the selection intact. Cleared on the next
     * createPagesSnapshot() call after it has been read, or when selectPage() is
     * called explicitly.
     */
    getSelectedPageFallback(): {
        wasClosed: boolean;
    } | undefined;
    /**
     * Creates a snapshot of the tracked workers. Today this is limited to
     * extension service workers; the McpWorker abstraction lets dedicated and
     * shared workers join the same snapshot later without changing consumers.
     */
    createWorkersSnapshot(): McpWorker[];
    getServiceWorkerConsoleData(serviceWorkerId: string): Array<ConsoleMessage | UncaughtError>;
    createPagesSnapshot(): Promise<McpPage[]>;
    getWorkers(): McpWorker[];
    getWorkerById(id: string): McpWorker | undefined;
    saveTemporaryFile(data: Uint8Array<ArrayBufferLike>, filename: string): Promise<{
        filepath: string;
    }>;
    saveFile(data: Uint8Array<ArrayBufferLike>, clientProvidedFilePath: string, extension: SupportedExtensions): Promise<{
        filename: string;
    }>;
    storeTraceRecording(result: TraceResult): void;
    recordedTraces(): TraceResult[];
    installExtension(extensionPath: string): Promise<string>;
    uninstallExtension(id: string): Promise<void>;
    triggerExtensionAction(id: string): Promise<void>;
    listExtensions(): Promise<Map<string, Extension>>;
    getExtension(id: string): Promise<Extension | undefined>;
    getHeapSnapshotAggregates(filePath: string, filterName?: string, objectId?: number): Promise<HeapSnapshotAggregateData>;
    getHeapSnapshotDuplicateStrings(filePath: string): Promise<DuplicateStringGroup[]>;
    queryHeapSnapshotObjects(filePath: string, options: HeapQueryOptions): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    getHeapSnapshotStats(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics>;
    getHeapSnapshotStaticData(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null>;
    getHeapSnapshotNativeContextSizes(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes>;
    getHeapSnapshotRetainedByContextSummary(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary>;
    getHeapSnapshotNodesById(filePath: string, id: number, filterName?: string, objectId?: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    getHeapSnapshotRetainers(filePath: string, nodeId: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    getHeapSnapshotObjectDetails(filePath: string, nodeId: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo>;
    analyzeHeapSnapshotContexts(filePath: string): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult>;
    closeHeapSnapshot(filePath: string): Promise<boolean>;
    getHeapSnapshotRetainingPaths(filePath: string, nodeId: number, maxDepth?: number, maxNodes?: number, maxSiblings?: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths>;
    getHeapSnapshotDominators(filePath: string, nodeId: number): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain>;
    loadResource(path: string): Promise<string>;
    getHeapSnapshotEdges(filePath: string, nodeId: number, options?: HeapEdgesQueryOptions): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    getHeapSnapshotClassDiffs(baseFilePath: string, currentFilePath: string): Promise<HeapSnapshotDiff>;
    getHeapSnapshotDetailedClassDiff(baseFilePath: string, currentFilePath: string, classIndex: number): Promise<HeapSnapshotDetailedClassDiff>;
}
