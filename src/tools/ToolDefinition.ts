/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../cli.js';
import type {TextSnapshotNode, GeolocationOptions} from '../McpContext.js';
import {zod} from '../third_party/index.js';
import type {
  Dialog,
  ElementHandle,
  Page,
  ScreenRecorder,
  Viewport,
} from '../third_party/index.js';
import type {InsightName, TraceResult} from '../trace-processing/parse.js';
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
  getSelectedPage(): Page;
  resolvePageById(pageId?: number): Page;
  getDialog(): Dialog | undefined;
  clearDialog(): void;
  getPageById(pageId: number): Page;
  newPage(background?: boolean, isolatedContextName?: string): Promise<Page>;
  closePage(pageId: number): Promise<void>;
  selectPage(page: Page): void;
  getElementByUid(uid: string): Promise<ElementHandle<Element>>;
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
  getNetworkConditions(): string | null;
  getCpuThrottlingRate(): number;
  getGeolocation(): GeolocationOptions | null;
  getViewport(): Viewport | null;
  getUserAgent(): string | null;
  getColorScheme(): 'dark' | 'light' | null;
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
  /**
   * Returns a reqid for a cdpRequestId.
   */
  resolveCdpElementId(cdpBackendNodeId: number): string | undefined;
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
  return definition;
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
