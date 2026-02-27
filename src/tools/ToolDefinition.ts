/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../cli.js';
import {zod} from '../third_party/index.js';
import type {
  Dialog,
  ElementHandle,
  Page,
  ScreenRecorder,
  Viewport,
} from '../third_party/index.js';
import type {InsightName, TraceResult} from '../trace-processing/parse.js';
import type {
  TextSnapshotNode,
  GeolocationOptions,
  DebuggerPausedState,
  DebuggerBreakpointInfo,
  DebuggerScriptInfo,
} from '../types.js';
import type {InstalledExtension} from '../utils/ExtensionRegistry.js';
import type {PaginationOptions} from '../utils/types.js';

import type {ToolCategory} from './categories.js';

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
  page?: Page;
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
    },
  ): void;
  includeSnapshot(params?: SnapshotParams): void;
  attachImage(value: ImageContentData): void;
  attachNetworkRequest(
    reqid: number,
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
}

/**
 * Only add methods required by tools/*.
 */
export type Context = Readonly<{
  isRunningPerformanceTrace(): boolean;
  setIsRunningPerformanceTrace(x: boolean): void;
  isCruxEnabled(): boolean;
  recordedTraces(): TraceResult[];
  storeTraceRecording(result: TraceResult): void;
  // TODO: Remove once slim tools are converted to pageScoped: true.
  getSelectedPage(): Page;
  getDialog(page?: Page): Dialog | undefined;
  clearDialog(page?: Page): void;
  getPageById(pageId: number): Page;
  newPage(background?: boolean, isolatedContextName?: string): Promise<Page>;
  closePage(pageId: number): Promise<void>;
  selectPage(page: Page): void;
  assertPageIsFocused(page: Page): void;
  getElementByUid(uid: string, page?: Page): Promise<ElementHandle<Element>>;
  getAXNodeByUid(uid: string): TextSnapshotNode | undefined;
  restoreEmulation(): Promise<void>;
  emulate(
    options: {
      networkConditions?: string | null;
      cpuThrottlingRate?: number | null;
      geolocation?: GeolocationOptions | null;
      userAgent?: string | null;
      colorScheme?: 'dark' | 'light' | 'auto' | null;
      viewport?: Viewport | null;
    },
    targetPage?: Page,
  ): Promise<void>;
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}>;
  saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}>;
  waitForEventsAfterAction(
    action: () => Promise<unknown>,
    options?: {timeout?: number},
  ): Promise<void>;
  waitForTextOnPage(
    text: string[],
    timeout?: number,
    page?: Page,
  ): Promise<Element>;
  getDevToolsData(): Promise<DevToolsData>;
  /**
   * Returns a reqid for a cdpRequestId.
   */
  resolveCdpRequestId(cdpRequestId: string): number | undefined;
  getScreenRecorder(): {recorder: ScreenRecorder; filePath: string} | null;
  setScreenRecorder(
    data: {recorder: ScreenRecorder; filePath: string} | null,
  ): void;
  installExtension(path: string): Promise<string>;
  uninstallExtension(id: string): Promise<void>;
  listExtensions(): InstalledExtension[];
  getExtension(id: string): InstalledExtension | undefined;
  // Debugger
  enableDebugger(page: Page): Promise<void>;
  disableDebugger(page: Page): Promise<void>;
  isDebuggerEnabled(page: Page): boolean;
  getDebuggerPausedState(page: Page): DebuggerPausedState | null;
  setBreakpoint(
    page: Page,
    url: string,
    lineNumber: number,
    columnNumber?: number,
    condition?: string,
  ): Promise<DebuggerBreakpointInfo>;
  removeBreakpoint(page: Page, breakpointId: string): Promise<void>;
  getBreakpoints(page: Page): DebuggerBreakpointInfo[];
  resumeDebugger(page: Page): Promise<void>;
  stepOver(page: Page): Promise<void>;
  stepInto(page: Page): Promise<void>;
  stepOut(page: Page): Promise<void>;
  evaluateOnCallFrame(
    page: Page,
    callFrameId: string,
    expression: string,
  ): Promise<string>;
  getScriptSource(page: Page, scriptId: string): Promise<string>;
  getDebuggerScripts(page: Page): DebuggerScriptInfo[];
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
    | ToolDefinition<Schema>
    | ((args?: Args) => ToolDefinition<Schema>),
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
    request: Request<Schema> & {page: Page},
    response: Response,
    context: Context,
  ) => Promise<void>;
}

export type DefinedPageTool<Schema extends zod.ZodRawShape = zod.ZodRawShape> =
  PageToolDefinition<Schema> & {
    pageScoped: true;
    handler: (
      request: Request<Schema> & {page: Page},
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
    | PageToolDefinition<Schema>
    | ((args?: Args) => PageToolDefinition<Schema>),
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
  pageId: zod.number().optional().describe('Targets a specific page by ID.'),
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
