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
import type {TextSnapshotNode, GeolocationOptions} from '../types.js';
import type {InstalledExtension} from '../utils/ExtensionRegistry.js';
import type {PaginationOptions} from '../utils/types.js';

import type {ToolCategory} from './categories.js';

export interface ToolDefinition<
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
    /**
     * If true, the tool operates on a specific page.
     * The `pageId` schema field is auto-injected and the resolved
     * page is provided via `request.page`.
     */
    pageScoped?: boolean;
  };
  schema: Schema;
  handler: (
    request: Request<Schema>,
    response: Response,
    context: Context,
  ) => Promise<void>;
}

export interface Request<Schema extends zod.ZodRawShape> {
  params: zod.objectOutputType<Schema, zod.ZodTypeAny>;
  /** Populated centrally for tools with `pageScoped: true`. */
  page?: Page;
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
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): Promise<{filename: string}>;
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
      const tool = factory(args);
      wrapPageScopedHandler(tool);
      return tool;
    };
  }
  wrapPageScopedHandler(definition);
  return definition;
}

function wrapPageScopedHandler<Schema extends zod.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  if (definition.annotations.pageScoped) {
    const originalHandler = definition.handler;
    definition.handler = async (request, response, context) => {
      // In production, main.ts resolves request.page centrally before calling
      // the handler. This fallback exists for tests that invoke handlers
      // directly without going through main.ts.
      request.page ??= context.getSelectedPage();
      return originalHandler(request, response, context);
    };
  }
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
