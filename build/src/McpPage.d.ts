/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ReadonlyServerConfig } from './config/ServerConfig.js';
import { DevToolsCommentBridge } from './devtools/DevToolsCommentBridge.js';
import { type TargetUniverse } from './devtools/DevtoolsUtils.js';
import { ConsoleCollector, NetworkCollector, type UncaughtError } from './collectors/PageCollector.js';
import { TextSnapshot } from './TextSnapshot.js';
import { type Locator, type Dialog, type ElementHandle, type Viewport, type WebMCPTool, type Protocol, type Page, type Target, type ConsoleMessage, type HTTPRequest, DevTools, type Flags, type JSONSchema7Definition, type RunnerResult } from './third_party/index.js';
import type { ToolGroups } from './tools/thirdPartyDeveloper.js';
import type { ContextPage, DevToolsData, MatchedStyles, Response, ScreenRecorderData } from './tools/ToolDefinition.js';
import type { EmulationSettings, ForcedColors, GeolocationOptions, PrefersContrast, PrefersReducedMotion, TextSnapshotNode } from './types.js';
import { WaitForHelper, type WaitForEventsResult, type DialogAction } from './utils/WaitForHelper.js';
export declare function replaceHtmlElementsWithUids(schema: JSONSchema7Definition): void;
/**
 * Per-page state wrapper. Consolidates dialog, snapshot, emulation,
 * and metadata that were previously scattered across Maps in McpContext.
 *
 * Internal class consumed only by McpContext. Fields are public for direct
 * read/write access. The dialog field is private because it requires an
 * event listener lifecycle managed by the init/dispose pair.
 */
export declare class McpPage implements ContextPage {
    #private;
    readonly target: Target;
    readonly id: number;
    textSnapshot: TextSnapshot | null;
    uniqueBackendNodeIdToMcpId: Map<string, string>;
    extraHandles: ElementHandle[];
    emulationSettings: EmulationSettings;
    isolatedContextName?: string;
    constructor(target: Target, id: number, options: {
        config: ReadonlyServerConfig;
        locatorClass: typeof Locator;
        isolatedContextName?: string;
        navigationTimeout?: number;
    });
    get pptrPage(): Page;
    get networkCollector(): NetworkCollector;
    set networkCollector(collector: NetworkCollector);
    get consoleCollector(): ConsoleCollector;
    url(): string;
    get targetId(): string;
    /**
     * Returns the page title or an empty string if the target only has Chrome's
     * URL-based placeholder title.
     *
     * Puppeteer's cached target info is only refreshed by
     * `Target.targetInfoChanged`, which Chrome emits on navigation commit (before
     * the document title is known) but not on title changes. Callers should pass
     * fresh target info (e.g., from `Target.getTargets`) when available.
     */
    getTitle(freshTargetInfo?: Protocol.Target.TargetInfo): string;
    isClosed(): boolean;
    close(): Promise<void>;
    init(options?: {
        emulateFocus?: boolean;
    }): Promise<void>;
    syncSourceMaps(): void;
    get devtoolsUniverse(): TargetUniverse | undefined;
    getDialog(): Dialog | undefined;
    clearDialog(): void;
    getScreenRecorder(): ScreenRecorderData | null;
    setScreenRecorder(data: ScreenRecorderData | null): void;
    isRunningPerformanceTrace(): boolean;
    setIsRunningPerformanceTrace(x: boolean): void;
    throwIfDialogOpen(): void;
    discoverThirdPartyDeveloperTools(): Promise<ToolGroups>;
    getWebMcpTools(): WebMCPTool[];
    resolveCdpRequestId(cdpRequestId: string): number | undefined;
    resolveReqidToCdpRequestId(reqid: number): string | undefined;
    getNetworkRequests(includePreservedRequests?: boolean): HTTPRequest[];
    get commentBridge(): DevToolsCommentBridge | undefined;
    disposeCommentBridge(): void;
    /**
     * Returns the comment bridge attached to the DevTools page, or undefined if
     * the DevTools page does not support DevTools comments.
     */
    ensureDevToolsCommentBridge(devtoolsPage: Page): Promise<DevToolsCommentBridge | undefined>;
    getDevToolsPage(): Promise<Page | undefined>;
    openDevTools(): Promise<Page | undefined>;
    getConsoleData(includePreservedMessages?: boolean): Array<ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError>;
    getConsoleMessageById(id: number): ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError;
    getNetworkRequestById(reqid: number): HTTPRequest;
    get networkConditions(): string | null;
    get cpuThrottlingRate(): number;
    get geolocation(): GeolocationOptions | null;
    get viewport(): Viewport | null;
    get userAgent(): string | null;
    get colorScheme(): 'dark' | 'light' | null;
    get forcedColors(): ForcedColors | null;
    get prefersContrast(): PrefersContrast | null;
    get prefersReducedMotion(): PrefersReducedMotion | null;
    createWaitForHelper(cpuMultiplier: number, networkMultiplier: number): WaitForHelper;
    waitForEventsAfterAction(action: (signal: AbortSignal) => Promise<unknown>, options?: {
        timeout?: number;
        waitForStableDom?: boolean;
        expectNavigationIn?: number;
        handleDialog?: DialogAction | Partial<Record<Protocol.Page.DialogType, DialogAction>>;
    }): Promise<WaitForEventsResult>;
    dispose(): void;
    executeThirdPartyDeveloperTool(toolName: string, params: Record<string, unknown>, response: Response): Promise<void>;
    getElementByUid(uid: string): Promise<ElementHandle<Element>>;
    getAXNodeByUid(uid: string): TextSnapshotNode | undefined;
    resolveBackendNodeId(backendNodeId: number): Promise<string | undefined>;
    resolveUidToBackendNodeId(uid: string): Promise<{
        backendNodeId: number;
        targetId?: string;
    } | undefined>;
    getMatchedStylesForUid(uid: string): Promise<MatchedStyles>;
    getDevToolsData(): Promise<DevToolsData>;
    restoreEmulation(): Promise<void>;
    emulate(options: {
        networkConditions?: string;
        cpuThrottlingRate?: number;
        geolocation?: GeolocationOptions;
        userAgent?: string;
        colorScheme?: 'dark' | 'light' | 'auto';
        forcedColors?: ForcedColors | 'auto';
        prefersContrast?: PrefersContrast | 'auto';
        prefersReducedMotion?: PrefersReducedMotion | 'auto';
        viewport?: Viewport;
        extraHttpHeaders?: Record<string, string> | undefined;
    }): Promise<void>;
    clearNetworkConditions(): void;
    updateTimeouts(): void;
    waitForTextOnPage(text: string[], options?: {
        timeout?: number;
        visible?: boolean;
    }): Promise<Element>;
    lighthouseNavigation(flags?: Flags): Promise<RunnerResult | undefined>;
    lighthouseSnapshot(flags?: Flags): Promise<RunnerResult | undefined>;
    /**
     * We need to ignore favicon request as they make our test flaky
     */
    setUpNetworkCollectorForTesting(): Promise<void>;
}
