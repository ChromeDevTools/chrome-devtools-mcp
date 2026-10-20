/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {categoryToFlagName} from '../config/category-options.js';
import type {ParsedArguments} from '../config/ConfigParser.js';
import type {
  HeapSnapshotAggregateData,
  HeapSnapshotDiff,
  HeapSnapshotDetailedClassDiff,
  DuplicateStringGroup,
  HeapEdgesQueryOptions,
  HeapQueryOptions,
} from '../processors/HeapSnapshotManager.js';
import type {McpPage} from '../McpPage.js';
import type {DevToolsCommentBridge} from '../devtools/DevToolsCommentBridge.js';
import type {CssFormatterOptions} from '../formatters/CssFormatter.js';
import type {
  ContextFilterOptions,
  HeapSnapshotFormatOptions,
} from '../formatters/HeapSnapshotFormatter.js';
import {zod} from '../third_party/index.js';
import type {
  Dialog,
  ElementHandle,
  Extension,
  GetPWAStateOptions,
  InstallPWAOptions,
  LaunchPWAOptions,
  PWAState,
  ScreenRecorder,
  ScreenRecording,
  UninstallPWAOptions,
  Viewport,
  DevTools,
  Protocol,
  Page,
  WebMCPTool,
} from '../third_party/index.js';
import type {InsightName, TraceResult} from '../processors/PerformanceTrace.js';
import type {
  TextSnapshotNode,
  GeolocationOptions,
  CD4ACommentThread,
  PaginationOptions,
  ForcedColors,
  PrefersContrast,
  PrefersReducedMotion,
} from '../types.js';
import type {McpWorker} from '../McpWorker.js';
import type {
  WaitForEventsResult,
  DialogAction,
} from '../utils/WaitForHelper.js';

import type {ToolCategory} from './categories.js';
import type {ToolGroups} from './thirdPartyDeveloper.js';

export type FileVerificationOption =
  | true
  | {
      local?: boolean;
      remote?: boolean;
      /**
       * When true, a value that parses as an `http(s):`/`ws(s):` URL is passed
       * through unchanged instead of being resolved as a filesystem path. Only
       * set this for parameters whose sink fetches the URL (for example a
       * source map or script source the server downloads) or hands it to the
       * browser (for example a PWA install URL). For filesystem-path
       * parameters it MUST stay unset: otherwise a value such as
       * `http://x/../../etc/passwd` skips `validatePath` and is resolved to an
       * absolute host path by the downstream filesystem API.
       */
      allowUrl?: boolean;
    };

type AllKeys<T> = T extends unknown ? keyof T : never;

/**
 * Which task queue `ToolHandler` runs a tool call on. A task on a queue
 * waits for tasks on the same queue, on its parent, and on its children.
 *
 * - `'exclusive'`: the context queue, for the whole call. No other browser
 *   tool runs at the same time. This is the default.
 * - `'page'`: the queue of the page named by `pageId`, a child of the
 *   context queue. Tools on different pages run at the same time; tools on
 *   one page and `'exclusive'` tools wait. Without page id routing the call
 *   runs on the context queue. Only for page-scoped tools whose handler
 *   touches the target page and no browser-global state.
 * - `'none'`: no queue. The tool runs at the same time as any other tool.
 *   For browserless tools, whose data guards itself (see
 *   `HeapSnapshotManager`), and for page tools that only read page state
 *   and wait for external events.
 */
export type ToolConcurrency = 'exclusive' | 'page' | 'none';

type ExtractSchemaField<Schema, K extends PropertyKey> = Schema extends unknown
  ? K extends keyof Schema
    ? Exclude<Schema[K], undefined>
    : never
  : never;

export type MergeSchema<Schema extends zod.ZodRawShape> = {
  [K in AllKeys<Schema>]: K extends keyof Schema
    ? undefined extends Schema[K]
      ? zod.ZodOptional<ExtractSchemaField<Schema, K>>
      : Schema[K]
    : zod.ZodOptional<ExtractSchemaField<Schema, K>>;
};

export interface CapabilityGate {
  category?: ToolCategory;
  conditions?: Array<keyof ParsedArguments>;
}

export interface BaseToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> {
  name: string;
  description: string;
  annotations: {
    title?: string;
    category: ToolCategory;
    /**
     * If true, the tool does not modify its environment.
     */
    readOnlyHint: boolean;
    /**
     * If `'slim'` is included, the tool is only available with `--slim`. Tools
     * without `'slim'` are only available without `--slim`, see
     * {@link isAvailableInMode}.
     */
    conditions?: Array<keyof ParsedArguments>;
  };
  schema: Schema;
  blockedByDialog: boolean;
  /**
   * Which queues the server holds while the tool runs. Defaults to
   * `'exclusive'`. See {@link ToolConcurrency}.
   */
  concurrency?: ToolConcurrency;
  verifyFilesSchema: Partial<
    Record<keyof MergeSchema<Schema>, FileVerificationOption>
  >;
}

export interface ToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> extends BaseToolDefinition<Schema> {
  schema: Schema;
  /**
   * Only page-scoped tools are checked for open dialogs by ToolHandler, so a
   * non-page tool must handle dialogs itself.
   */
  blockedByDialog: false;
  /**
   * A non-page tool has no target page, so it cannot take the page queue. It
   * touches browser state, so it always runs in a queue.
   */
  concurrency?: Exclude<ToolConcurrency, 'page' | 'none'>;
  handler(
    request: Request<Schema>,
    response: Response,
    context: Context,
  ): Promise<void>;
}

export type SchemaType<T extends zod.ZodRawShape> = zod.output<
  zod.ZodObject<MergeSchema<T>>
>;

export interface Request<Schema extends zod.ZodRawShape> {
  params: SchemaType<Schema>;
}

export interface ImageContentData {
  data: string;
  mimeType: string;
}

export interface SnapshotParams {
  verbose?: boolean;
  filePath?: string;
}

export interface LighthouseAuditNode {
  selector?: string;
  snippet?: string;
  nodeLabel?: string;
  explanation?: string;
}

export interface LighthouseFailedAudit {
  id: string;
  title: string;
  description?: string;
  score: number;
  displayValue?: string;
  /**
   * IDs of the categories that reference this audit.
   */
  categories: string[];
  /**
   * DOM nodes flagged by the audit, capped to a small number.
   */
  nodes: LighthouseAuditNode[];
  /**
   * Total number of distinct DOM nodes flagged by the audit, which may exceed
   * the number of entries in `nodes`.
   */
  totalNodes: number;
}

export interface LighthouseData {
  summary: {
    mode: string;
    device: string;
    url?: string;
    scores: Array<{
      id: string;
      title: string;
      score: number | null;
    }>;
    audits: {
      failed: number;
      passed: number;
    };
    timing: {
      total: number;
    };
  };
  failedAudits: LighthouseFailedAudit[];
  reports: string[];
}

export interface DevToolsData {
  cdpRequestId?: string;
  cdpBackendNodeId?: number;
}

export interface Response {
  appendResponseLine(value: string): void;
  setHeapSnapshotAggregates(
    aggregateData: HeapSnapshotAggregateData,
    options?: PaginationOptions & HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotStats(
    stats: DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics,
    staticData: DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null,
    nativeContextSizes: DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes,
    retainedByContextSummary: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary,
    options?: HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotNodes(
    nodes: DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange,
    options?: PaginationOptions & HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotDuplicateStrings(
    duplicateStrings: DuplicateStringGroup[],
    options?: PaginationOptions & HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotRetainingPaths(
    retainingPaths: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths,
    options?: HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotDominators(
    dominators: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain,
    options?: HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotClassDiffs(
    diff: HeapSnapshotDiff,
    options?: PaginationOptions & HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotDetailedClassDiff(
    detailedClassDiff: HeapSnapshotDetailedClassDiff,
    options?: PaginationOptions & HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotObjectDetails(
    objectInfo: DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo,
    options?: HeapSnapshotFormatOptions,
  ): void;
  setHeapSnapshotContextAnalysis(
    analysis: DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult,
    options?: PaginationOptions &
      ContextFilterOptions &
      HeapSnapshotFormatOptions,
  ): void;
  setIncludePages(value: boolean): void;
  setIncludeNetworkRequests(
    value: boolean,
    options?: PaginationOptions & {
      resourceTypes?: string[];
      includePreservedRequests?: boolean;
      networkRequestIdInDevToolsUI?: number;
    },
  ): void;
  setIncludeConsoleData(
    value: boolean,
    options?: PaginationOptions & {
      types?: string[];
      includePreservedMessages?: boolean;
      includeStackTraces?: boolean;
      serviceWorkerId?: string;
    },
  ): void;
  setIncludeCssStyles(
    matchedStyles: MatchedStyles,
    options: CssFormatterOptions & PaginationOptions,
  ): void;
  includeSnapshot(params?: SnapshotParams): void;
  attachImage(value: ImageContentData): void;
  attachNetworkRequest(
    reqId: number,
    options?: {requestFilePath?: string; responseFilePath?: string},
  ): void;
  attachConsoleMessage(msgid: number): void;
  // Allows re-using DevTools data queried by some tools.
  attachDevToolsData(data: DevToolsData): void;
  setTabId(tabId: string): void;
  attachTraceSummary(trace: TraceResult): void;
  attachTraceInsight(
    trace: TraceResult,
    insightSetId: string,
    insightName: InsightName,
  ): void;
  setListExtensions(): void;
  attachLighthouseResult(result: LighthouseData): void;
  setListThirdPartyDeveloperTools(): void;
  setListWebMcpTools(): void;
  attachWaitForResult(result: WaitForEventsResult): void;
  setDevToolsComments(threads: CD4ACommentThread[]): void;
}

export type SupportedExtensions =
  | '.png'
  | '.jpeg'
  | '.webp'
  | '.json'
  | '.network-response'
  | '.network-request'
  | '.html'
  | '.txt'
  | '.csv'
  | '.gz';

/**
 * Only add methods used by tools/*.
 */
export interface ScreenRecorderData {
  recorder: ScreenRecorder | ScreenRecording;
  filePath: string;
}

export type Context = Readonly<{
  installPWA(options: InstallPWAOptions): Promise<string>;
  uninstallPWA(options: UninstallPWAOptions): Promise<void>;
  launchPWA(options: LaunchPWAOptions): Promise<Page>;
  getPWAState(options: GetPWAStateOptions): Promise<PWAState>;
  ensureExtension<Extension extends `.${string}`>(
    filePath: string,
    extension: Extension,
  ): Promise<`${string}${Extension}`>;
  isRunningPerformanceTrace(): boolean;
  isCruxEnabled(): boolean;
  recordedTraces(): TraceResult[];
  storeTraceRecording(result: TraceResult): void;
  getPageById(pageId: number): ContextPage;
  newPage(
    background?: boolean,
    isolatedContextName?: string,
  ): Promise<ContextPage>;
  closePage(pageId: number): Promise<void>;
  selectPage(page: ContextPage): void;
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}>;
  saveFile(
    data: Uint8Array<ArrayBufferLike>,
    clientProvidedFilePath: string,
    extension: SupportedExtensions,
  ): Promise<{filename: string}>;
  loadResource(path: string): Promise<string>;

  installExtension(path: string): Promise<string>;
  uninstallExtension(id: string): Promise<void>;
  triggerExtensionAction(id: string): Promise<void>;
  listExtensions(): Promise<Map<string, Extension>>;
  getExtension(id: string): Promise<Extension | undefined>;
  getSelectedMcpPage(): McpPage;
  getWorkers(): McpWorker[];
  getWorkerById(id: string): McpWorker | undefined;
}>;

/**
 * The context available to tools that do not need a browser connection, see
 * {@link defineBrowserlessTool}. Using it never triggers a browser launch or
 * connection.
 */
export type BrowserlessContext = Readonly<{
  getHeapSnapshotAggregates(
    filePath: string,
    filterName?: string,
    objectId?: number,
  ): Promise<HeapSnapshotAggregateData>;
  getHeapSnapshotDuplicateStrings(
    filePath: string,
  ): Promise<DuplicateStringGroup[]>;
  getHeapSnapshotStats(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics>;
  getHeapSnapshotStaticData(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null>;
  getHeapSnapshotNativeContextSizes(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes>;
  getHeapSnapshotRetainedByContextSummary(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary>;
  getHeapSnapshotNodesById(
    filePath: string,
    id: number,
    filterName?: string,
    objectId?: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
  getHeapSnapshotRetainers(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
  getHeapSnapshotObjectDetails(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo>;
  analyzeHeapSnapshotContexts(
    filePath: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult>;
  closeHeapSnapshot(filePath: string): Promise<boolean>;
  getHeapSnapshotRetainingPaths(
    filePath: string,
    nodeId: number,
    maxDepth?: number,
    maxNodes?: number,
    maxSiblings?: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths>;
  getHeapSnapshotDominators(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain>;
  getHeapSnapshotEdges(
    filePath: string,
    nodeId: number,
    options?: HeapEdgesQueryOptions,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
  getHeapSnapshotClassDiffs(
    baseFilePath: string,
    currentFilePath: string,
  ): Promise<HeapSnapshotDiff>;
  getHeapSnapshotDetailedClassDiff(
    baseFilePath: string,
    currentFilePath: string,
    classIndex: number,
  ): Promise<HeapSnapshotDetailedClassDiff>;
  queryHeapSnapshotObjects(
    filePath: string,
    options: HeapQueryOptions,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
}>;

export type MatchedStyles = DevTools.CSSMatchedStyles.CSSMatchedStyles;

/**
 * Only add methods used by tools/*.
 */
export type ContextPage = Readonly<{
  readonly pptrPage: Page;
  readonly cpuThrottlingRate: number;
  readonly networkConditions: string | null;
  init(options?: {emulateFocus?: boolean}): Promise<void>;
  getAXNodeByUid(uid: string): TextSnapshotNode | undefined;
  getElementByUid(uid: string): Promise<ElementHandle<Element>>;
  getMatchedStylesForUid(uid: string): Promise<MatchedStyles>;

  /**
   * Returns a reqid for a cdpRequestId.
   */
  resolveCdpRequestId(cdpRequestId: string): number | undefined;
  resolveReqidToCdpRequestId(reqid: number): string | undefined;
  resolveBackendNodeId(backendNodeId: number): Promise<string | undefined>;
  resolveUidToBackendNodeId(
    uid: string,
  ): Promise<{backendNodeId: number; targetId?: string} | undefined>;

  getDialog(): Dialog | undefined;
  clearDialog(): void;
  throwIfDialogOpen(): void;
  getScreenRecorder(): ScreenRecorderData | null;
  setScreenRecorder(data: ScreenRecorderData | null): void;
  setIsRunningPerformanceTrace(x: boolean): void;
  waitForEventsAfterAction(
    action: (signal: AbortSignal) => Promise<unknown>,
    options?: {
      timeout?: number;
      waitForStableDom?: boolean;
      handleDialog?:
        DialogAction | Partial<Record<Protocol.Page.DialogType, DialogAction>>;
    },
  ): Promise<WaitForEventsResult>;
  getWebMcpTools(): WebMCPTool[];
  discoverThirdPartyDeveloperTools(): Promise<ToolGroups>;

  executeThirdPartyDeveloperTool(
    toolName: string,
    params: Record<string, unknown>,
    response: Response,
  ): Promise<void>;
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
  }): Promise<void>;
  waitForTextOnPage(text: string[], timeout?: number): Promise<Element>;
  getDevToolsPage(): Promise<Page | undefined>;
  openDevTools(): Promise<Page | undefined>;
  ensureDevToolsCommentBridge(
    devtoolsPage: Page,
  ): Promise<DevToolsCommentBridge | undefined>;
}>;

export function defineTool<Schema extends zod.ZodRawShape>(
  definition: (args: ParsedArguments) => ToolDefinition<Schema>,
): (args: ParsedArguments) => ToolDefinition<Schema> {
  return definition;
}

interface PageToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> extends BaseToolDefinition<Schema> {
  /**
   * A page tool with `'none'` must only read page state. Its page lookup and
   * response formatting run at the same time as other tools on the page.
   */
  concurrency?: ToolConcurrency;
  handler(
    request: Request<Schema> & {page: ContextPage},
    response: Response,
    context: Context,
  ): Promise<void>;
}

export type DefinedPageTool<Schema extends zod.ZodRawShape = zod.ZodRawShape> =
  Omit<PageToolDefinition<Schema>, 'schema'> & {
    schema: Schema & Partial<typeof pageIdSchema>;
    pageScoped: true;
  };

export function definePageTool<Schema extends zod.ZodRawShape>(
  definition: (args: ParsedArguments) => PageToolDefinition<Schema>,
): (args: ParsedArguments) => DefinedPageTool<Schema> {
  return (args: ParsedArguments): DefinedPageTool<Schema> => {
    const tool = definition(args);
    return {
      ...tool,
      schema: {
        ...(args.pageIdRouting && !isSlimTool(tool) ? pageIdSchema : {}),
        ...tool.schema,
      },
      pageScoped: true,
    };
  };
}

export interface BrowserlessToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> extends BaseToolDefinition<Schema> {
  browserless: true;
  /**
   * Browserless tools have no page, so ToolHandler never checks them for open
   * dialogs.
   */
  blockedByDialog: false;
  /**
   * A browserless tool has no page.
   */
  concurrency?: Exclude<ToolConcurrency, 'page'>;
  handler(
    request: Request<Schema>,
    response: Response,
    context: BrowserlessContext,
  ): Promise<void>;
}

/**
 * Defines a tool that does not need a browser connection, e.g. a tool that only
 * analyzes local files. Its handler only receives a {@link BrowserlessContext}.
 * Such a tool runs without the context queue (`concurrency: 'none'`) unless
 * the definition sets another value.
 */
export function defineBrowserlessTool<Schema extends zod.ZodRawShape>(
  definition: (
    args: ParsedArguments,
  ) => Omit<BrowserlessToolDefinition<Schema>, 'browserless'>,
): (args: ParsedArguments) => BrowserlessToolDefinition<Schema> {
  return (args: ParsedArguments): BrowserlessToolDefinition<Schema> => {
    return {
      concurrency: 'none',
      ...definition(args),
      browserless: true,
    };
  };
}

export type AnyToolDefinition =
  ToolDefinition | DefinedPageTool | BrowserlessToolDefinition;

export function isPageScopedTool(
  tool: AnyToolDefinition,
): tool is DefinedPageTool {
  return 'pageScoped' in tool && tool.pageScoped === true;
}

export function isBrowserlessTool(
  tool: AnyToolDefinition,
): tool is BrowserlessToolDefinition {
  return 'browserless' in tool && tool.browserless === true;
}

export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';

export const pageIdSchema = {
  pageId: zod.number().describe('Targets a specific page by ID.'),
};

export function zodTransform<Input, Output>(
  transform: (arg: Input) => Output,
): (arg: Input, ctx: zod.RefinementCtx) => Output {
  return (arg: Input, ctx: zod.RefinementCtx): Output => {
    try {
      return transform(arg);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : String(error),
      });
      return zod.NEVER;
    }
  };
}

export const timeoutSchema = {
  timeout: zod
    .number()
    .int()
    .transform(
      zodTransform(value => {
        return value <= 0 ? undefined : value;
      }),
    )
    .optional()
    .describe(
      `Maximum wait time in milliseconds. If set to 0, the default timeout will be used.`,
    ),
};

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const VALID_VIEWPORT_TAGS = new Set(['mobile', 'touch', 'landscape']);

function parseDecimal(part: string | undefined, name: string): number {
  if (part === undefined || !DECIMAL.test(part)) {
    throw new Error(
      `Invalid ${name} "${part ?? ''}". Expected a decimal number.`,
    );
  }
  return Number(part);
}

export function viewportTransform(arg: string | undefined):
  | {
      width: number;
      height: number;
      deviceScaleFactor?: number;
      isMobile?: boolean;
      isLandscape?: boolean;
      hasTouch?: boolean;
    }
  | undefined {
  if (!arg) {
    return undefined;
  }
  const [dimensions, ...tags] = arg.split(',');
  for (const tag of tags) {
    if (!VALID_VIEWPORT_TAGS.has(tag)) {
      throw new Error(
        `Invalid viewport tag "${tag}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]'.`,
      );
    }
  }
  const isMobile = tags.includes('mobile');
  const hasTouch = tags.includes('touch');
  const isLandscape = tags.includes('landscape');
  const dimParts = dimensions.split('x');
  if (dimParts.length !== 2 && dimParts.length !== 3) {
    throw new Error(
      `Invalid viewport dimensions "${dimensions}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]'.`,
    );
  }
  const width = parseDecimal(dimParts[0], 'viewport width');
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(
      `Invalid viewport width "${width}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]' with a positive width.`,
    );
  }
  const height = parseDecimal(dimParts[1], 'viewport height');
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(
      `Invalid viewport height "${height}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]' with a positive height.`,
    );
  }
  let deviceScaleFactor: number | undefined;
  if (dimParts.length === 3) {
    const dpr = parseDecimal(dimParts[2], 'devicePixelRatio');
    if (!Number.isFinite(dpr) || dpr <= 0) {
      throw new Error(
        `Invalid devicePixelRatio "${dpr}". Expected a positive number.`,
      );
    }
    deviceScaleFactor = dpr;
  }
  return {
    width,
    height,
    deviceScaleFactor,
    isMobile,
    isLandscape,
    hasTouch,
  };
}

export function geolocationTransform(
  arg: string | undefined,
): {latitude: number; longitude: number} | undefined {
  if (!arg) {
    return undefined;
  }
  const parts = arg.split(',');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid geolocation "${arg}". Expected '<latitude>,<longitude>'.`,
    );
  }
  const latitude = parseDecimal(parts[0], 'latitude');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(
      `Invalid latitude "${latitude}". Latitude must be a number between -90 and 90.`,
    );
  }
  const longitude = parseDecimal(parts[1], 'longitude');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(
      `Invalid longitude "${longitude}". Longitude must be a number between -180 and 180.`,
    );
  }
  return {
    latitude,
    longitude,
  };
}

export function isSlimTool(
  tool: Pick<BaseToolDefinition, 'annotations'>,
): boolean {
  return Boolean(tool.annotations.conditions?.includes('slim'));
}

/**
 * Slim mode replaces the regular tools with the slim tools.
 */
export function isAvailableInMode(
  tool: Pick<BaseToolDefinition, 'annotations'>,
  serverArgs: Pick<ParsedArguments, 'slim'>,
): boolean {
  return isSlimTool(tool) === Boolean(serverArgs.slim);
}

/**
 * Returns whether a capability gate is enabled under the given arguments.
 */
export function isCapabilityEnabled(
  gate: CapabilityGate,
  serverArgs: ParsedArguments,
): boolean {
  if (Boolean(gate.conditions?.includes('slim')) !== Boolean(serverArgs.slim)) {
    return false;
  }
  if (gate.category && !serverArgs[categoryToFlagName(gate.category)]) {
    return false;
  }
  for (const condition of gate.conditions ?? []) {
    if (!serverArgs[condition]) {
      return false;
    }
  }
  return true;
}
