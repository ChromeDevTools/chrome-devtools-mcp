/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {TextSnapshotNode, GeolocationOptions} from '../McpContext.js';
import {zod} from '../third_party/index.js';
import type {
  Dialog,
  ElementHandle,
  Page,
  Viewport,
} from '../third_party/index.js';
import type {InsightName, TraceResult} from '../trace-processing/parse.js';
import type {InstalledExtension} from '../utils/ExtensionRegistry.js';
import type {PaginationOptions} from '../utils/types.js';

import type {ToolCategory} from './categories.js';

/**
 * Maximum response size in characters to prevent overwhelming context windows.
 */
export const CHARACTER_LIMIT = 25000;

/**
 * Standard response format options.
 */
export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json',
}

/**
 * Standard pagination metadata for list responses.
 */
export interface PaginationMetadata {
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

export interface ToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
  OutputSchema extends zod.ZodTypeAny = zod.ZodTypeAny,
> {
  name: string;
  description: string;
  /**
   * Maximum time in milliseconds for this tool to complete.
   * If not specified, defaults to 30000 (30 seconds).
   */
  timeoutMs?: number;
  annotations: {
    title?: string;
    category: ToolCategory;
    /**
     * If true, the tool does not modify its environment.
     */
    readOnlyHint: boolean;
    /**
     * If true, the tool may perform destructive updates.
     * Default: true (conservative assumption).
     */
    destructiveHint?: boolean;
    /**
     * If true, repeated calls with same args have no additional effect.
     */
    idempotentHint?: boolean;
    /**
     * If true, the tool interacts with external entities.
     * Default: true.
     */
    openWorldHint?: boolean;
    conditions?: string[];
  };
  schema: Schema;
  outputSchema?: OutputSchema;
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
  getDialog(): Dialog | undefined;
  clearDialog(): void;
  getPageById(pageId: number): Page;
  getPageId(page: Page): number | undefined;
  isPageSelected(page: Page): boolean;
  newPage(background?: boolean): Promise<Page>;
  closePage(pageId: number): Promise<void>;
  selectPage(page: Page): void;
  getElementByUid(uid: string): Promise<ElementHandle<Element>>;
  getAXNodeByUid(uid: string): TextSnapshotNode | undefined;
  setNetworkConditions(conditions: string | null): void;
  setCpuThrottlingRate(rate: number): void;
  setGeolocation(geolocation: GeolocationOptions | null): void;
  setViewport(viewport: Viewport | null): void;
  getViewport(): Viewport | null;
  setUserAgent(userAgent: string | null): void;
  getUserAgent(): string | null;
  setColorScheme(scheme: 'dark' | 'light' | null): void;
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
  waitForTextOnPage(text: string, timeout?: number): Promise<Element>;
  getDevToolsData(): Promise<DevToolsData>;
  /**
   * Returns a reqid for a cdpRequestId.
   */
  resolveCdpRequestId(cdpRequestId: string): number | undefined;
  /**
   * Returns a reqid for a cdpRequestId.
   */
  resolveCdpElementId(cdpBackendNodeId: number): string | undefined;
  installExtension(path: string): Promise<string>;
  uninstallExtension(id: string): Promise<void>;
  listExtensions(): InstalledExtension[];
  getExtension(id: string): InstalledExtension | undefined;
}>;

export function defineTool<Schema extends zod.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}

export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';

export const responseFormatSchema = zod.nativeEnum(ResponseFormat)
  .optional()
  .default(ResponseFormat.MARKDOWN)
  .describe(
    'Output format: "markdown" for human-readable or "json" for machine-readable structured data.',
  );

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

/**
 * Check if content exceeds CHARACTER_LIMIT and throw an error with available params.
 */
export function checkCharacterLimit(
  content: string,
  toolName: string,
  availableParams: Record<string, string>,
): void {
  if (content.length > CHARACTER_LIMIT) {
    const paramList = Object.entries(availableParams)
      .map(([name, desc]) => `  - ${name}: ${desc}`)
      .join('\n');
    throw new Error(
      `Response too long (${content.length} chars, limit: ${CHARACTER_LIMIT}). ` +
      `Optimize your request using these parameters:\n${paramList}`,
    );
  }
}

/**
 * Create standard pagination metadata.
 */
export function createPaginationMetadata(
  total: number,
  count: number,
  offset: number,
): PaginationMetadata {
  const has_more = total > offset + count;
  return {
    total,
    count,
    offset,
    has_more,
    ...(has_more ? { next_offset: offset + count } : {}),
  };
}
