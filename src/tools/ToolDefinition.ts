/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../bin/chrome-devtools-mcp-cli-options.js';
import type {
  HeapSnapshotAggregateData,
  HeapSnapshotClassDiff,
  HeapSnapshotDetailedClassDiff,
  DuplicateStringGroup,
} from '../HeapSnapshotManager.js';
import type {McpPage} from '../McpPage.js';
import {zod} from '../third_party/index.js';
import type {
  Dialog,
  ElementHandle,
  Extension,
  ScreenRecorder,
  Viewport,
  DevTools,
  Protocol,
  Page,
} from '../third_party/index.js';
import type {InsightName, TraceResult} from '../trace-processing/parse.js';
import type {
  TextSnapshotNode,
  GeolocationOptions,
  ExtensionServiceWorker,
} from '../types.js';
import type {PaginationOptions} from '../utils/types.js';
import type {WaitForEventsResult, DialogAction} from '../WaitForHelper.js';

import type {ToolCategory} from './categories.js';
import type {ToolGroups} from './thirdPartyDeveloper.js';

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
    conditions?: string[];
  };
  schema: Schema;
  blockedByDialog: boolean;
  verifyFilesSchema: Array<keyof Schema>;
}

export interface ToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> extends BaseToolDefinition<Schema> {
  schema: Schema;
  handler: (
    request: Request<Schema>,
    response: Response,
    context: Context,
  ) => Promise<void>;
}

export interface Request<Schema extends zod.ZodRawShape> {
  params: zod.objectOutputType<Schema, zod.ZodTypeAny>;
}

export interface ImageContentData {
  data: string;
  mimeType: string;
}

export interface SnapshotParams {
  verbose?: boolean;
  filePath?: string;
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
    options?: PaginationOptions,
  ): void;
  setHeapSnapshotStats(
    stats: DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics,
    staticData: DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData | null,
  ): void;
  setHeapSnapshotNodes(
    nodes: DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange,
    options?: PaginationOptions,
  ): void;
  setHeapSnapshotDuplicateStrings(
    duplicateStrings: DuplicateStringGroup[],
    options?: PaginationOptions,
  ): void;
  setHeapSnapshotRetainingPaths(
    retainingPaths: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths,
  ): void;
  setHeapSnapshotDominators(
    dominators: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain,
  ): void;
  setHeapSnapshotClassDiffs(classDiffs: HeapSnapshotClassDiff[]): void;
  setHeapSnapshotDetailedClassDiff(
    detailedClassDiff: HeapSnapshotDetailedClassDiff,
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
      serviceWorkerId?: string;
    },
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
export type Context = Readonly<{
  validatePath(filePath?: string): Promise<void>;
  ensureExtension<Extension extends `.${string}`>(
    filePath: string,
    extension: Extension,
  ): Promise<`${string}${Extension}`>;
  isRunningPerformanceTrace(): boolean;
  setIsRunningPerformanceTrace(x: boolean): void;
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
  restoreEmulation(page: ContextPage): Promise<void>;
  emulate(
    options: {
      networkConditions?: string;
      cpuThrottlingRate?: number;
      geolocation?: GeolocationOptions;
      userAgent?: string;
      colorScheme?: 'dark' | 'light' | 'auto';
      viewport?: Viewport;
    },
    mcpPage?: ContextPage,
  ): Promise<void>;
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}>;
  saveFile(
    data: Uint8Array<ArrayBufferLike>,
    clientProvidedFilePath: string,
    extension: SupportedExtensions,
  ): Promise<{filename: string}>;
  waitForTextOnPage(
    text: string[],
    timeout?: number,
    mcpPage?: ContextPage,
  ): Promise<Element>;

  getScreenRecorder(): {recorder: ScreenRecorder; filePath: string} | null;
  setScreenRecorder(
    data: {recorder: ScreenRecorder; filePath: string} | null,
  ): void;
  installExtension(path: string): Promise<string>;
  uninstallExtension(id: string): Promise<void>;
  triggerExtensionAction(id: string): Promise<void>;
  listExtensions(): Promise<Map<string, Extension>>;
  getExtension(id: string): Promise<Extension | undefined>;
  getSelectedMcpPage(): McpPage;
  getExtensionServiceWorkers(): ExtensionServiceWorker[];
  getExtensionServiceWorkerId(
    extensionServiceWorker: ExtensionServiceWorker,
  ): string | undefined;
  getHeapSnapshotAggregates(
    filePath: string,
    filterName?: string,
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
  getHeapSnapshotNodesById(
    filePath: string,
    id: number,
    filterName?: string,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
  getHeapSnapshotRetainers(
    filePath: string,
    nodeId: number,
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
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
  ): Promise<DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
  getHeapSnapshotClassDiffs(
    baseFilePath: string,
    currentFilePath: string,
  ): Promise<HeapSnapshotClassDiff[]>;
  getHeapSnapshotDetailedClassDiff(
    baseFilePath: string,
    currentFilePath: string,
    classIndex: number,
  ): Promise<HeapSnapshotDetailedClassDiff>;
}>;

/**
 * Only add methods used by tools/*.
 */
export type ContextPage = Readonly<{
  readonly pptrPage: Page;
  readonly cpuThrottlingRate: number;
  readonly networkConditions: string | null;
  getAXNodeByUid(uid: string): TextSnapshotNode | undefined;
  getElementByUid(uid: string): Promise<ElementHandle<Element>>;

  /**
   * Returns a reqid for a cdpRequestId.
   */
  resolveCdpRequestId(cdpRequestId: string): number | undefined;

  getDialog(): Dialog | undefined;
  clearDialog(): void;
  throwIfDialogOpen(): void;
  waitForEventsAfterAction(
    action: () => Promise<unknown>,
    options?: {
      timeout?: number;
      handleDialog?:
        DialogAction | Partial<Record<Protocol.Page.DialogType, DialogAction>>;
    },
  ): Promise<WaitForEventsResult>;
  getThirdPartyDeveloperTools(): ToolGroups;

  executeThirdPartyDeveloperTool(
    toolName: string,
    params: Record<string, unknown>,
    response: Response,
  ): Promise<void>;
  getDevToolsData(): Promise<DevToolsData>;
}>;

export function defineTool<Schema extends zod.ZodRawShape>(
  definition: ToolDefinition<Schema>,
): ToolDefinition<Schema>;

export function defineTool<
  Schema extends zod.ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(
  definition: (args?: Args) => ToolDefinition<Schema>,
): (args?: Args) => ToolDefinition<Schema>;

export function defineTool<
  Schema extends zod.ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(
  definition:
    ToolDefinition<Schema> | ((args?: Args) => ToolDefinition<Schema>),
) {
  if (typeof definition === 'function') {
    const factory = definition;
    return (args: Args) => {
      return factory(args);
    };
  }
  return definition;
}

interface PageToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> extends BaseToolDefinition<Schema> {
  handler: (
    request: Request<Schema> & {page: ContextPage},
    response: Response,
    context: Context,
  ) => Promise<void>;
}

export type DefinedPageTool<Schema extends zod.ZodRawShape = zod.ZodRawShape> =
  PageToolDefinition<Schema> & {
    pageScoped: true;
    handler: (
      request: Request<Schema> & {page: ContextPage},
      response: Response,
      context: Context,
    ) => Promise<void>;
  };

export function definePageTool<Schema extends zod.ZodRawShape>(
  definition: PageToolDefinition<Schema>,
): DefinedPageTool<Schema>;

export function definePageTool<
  Schema extends zod.ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(
  definition: (args?: Args) => PageToolDefinition<Schema>,
): (args?: Args) => DefinedPageTool<Schema>;

export function definePageTool<
  Schema extends zod.ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(
  definition:
    PageToolDefinition<Schema> | ((args?: Args) => PageToolDefinition<Schema>),
): DefinedPageTool<Schema> | ((args?: Args) => DefinedPageTool<Schema>) {
  if (typeof definition === 'function') {
    return (args?: Args): DefinedPageTool<Schema> => {
      const tool = definition(args);
      return {
        ...tool,
        pageScoped: true,
      };
    };
  }

  return {
    ...definition,
    pageScoped: true,
  } as DefinedPageTool<Schema>;
}

export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';

export const pageIdSchema = {
  pageId: zod.number().describe('Targets a specific page by ID.'),
};

export const timeoutSchema = {
  timeout: zod
    .number()
    .int()
    .optional()
    .describe(
      `Maximum wait time in milliseconds. If set to 0, the default timeout will be used.`,
    )
    .transform(value => {
      return value && value <= 0 ? undefined : value;
    }),
};

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
  const isMobile = tags.includes('mobile');
  const hasTouch = tags.includes('touch');
  const isLandscape = tags.includes('landscape');
  const [width, height, dpr] = dimensions.split('x').map(Number) as [
    number,
    number,
    number | undefined,
  ];
  return {
    width,
    height,
    deviceScaleFactor: dpr,
    isMobile: isMobile,
    isLandscape: isLandscape,
    hasTouch: hasTouch,
  };
}

export function geolocationTransform(arg: string | undefined) {
  if (!arg) {
    return undefined;
  }
  const [latitude, longitude] = arg.split(',').map(Number) as [number, number];
  return {
    latitude,
    longitude,
  };
}
