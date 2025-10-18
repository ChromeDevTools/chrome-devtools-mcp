/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ConsoleMessageType, Dialog, ElementHandle, Page, ResourceType} from 'puppeteer-core';

import type {TextSnapshotNode} from '../McpContext.js';
import {zod} from '../third_party/modelcontextprotocol-sdk/index.js';
import type {TraceResult} from '../trace-processing/parse.js';
import type {PaginationOptions} from '../utils/types.js';

import type {ToolCategories} from './categories.js';

export interface ToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> {
  name: string;
  description: string;
  annotations: {
    title?: string;
    category: ToolCategories;
    /**
     * If true, the tool does not modify its environment.
     */
    readOnlyHint: boolean;
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

export interface Response {
  appendResponseLine(value: string): void;
  setIncludePages(value: boolean): void;
  setIncludeNetworkRequests(
    value: boolean,
    options?: PaginationOptions & {
      resourceTypes?: string[];
    },
  ): void;
  setIncludeConsoleData(
    value: boolean,
    options?: PaginationOptions & {
      types?: string[];
    },
  ): void;
  setIncludeSnapshot(value: boolean): void;
  setIncludeSnapshot(value: boolean, verbose?: boolean): void;
  attachImage(value: ImageContentData): void;
  attachNetworkRequest(reqid: number): void;
}

/**
 * Only add methods required by tools/*.
 */
export type Context = Readonly<{
  isRunningPerformanceTrace(): boolean;
  setIsRunningPerformanceTrace(x: boolean): void;
  recordedTraces(): TraceResult[];
  storeTraceRecording(result: TraceResult): void;
  getSelectedPage(): Page;
  getDialog(): Dialog | undefined;
  clearDialog(): void;
  getPageByIdx(idx: number): Page;
  newPage(): Promise<Page>;
  closePage(pageIdx: number): Promise<void>;
  setSelectedPageIdx(idx: number): void;
  getElementByUid(uid: string): Promise<ElementHandle<Element>>;
  getAXNodeByUid(uid: string): TextSnapshotNode | undefined;
  setNetworkConditions(conditions: string | null): void;
  setCpuThrottlingRate(rate: number): void;
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): Promise<{filename: string}>;
  saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}>;
  waitForEventsAfterAction(action: () => Promise<unknown>): Promise<void>;
}>;

export function defineTool<Schema extends zod.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}

export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';

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

export const snapshotSchema = {
  verbose: zod
    .boolean()
    .optional()
    .describe(
      'Whether to include all possible information available in the full a11y tree. Default is false.',
    ),
};

const FILTERABLE_MESSAGE_TYPES: readonly [
  ConsoleMessageType,
  ...ConsoleMessageType[],
] = [
    'log',
    'debug',
    'info',
    'error',
    'warn',
    'dir',
    'dirxml',
    'table',
    'trace',
    'clear',
    'startGroup',
    'startGroupCollapsed',
    'endGroup',
    'assert',
    'profile',
    'profileEnd',
    'count',
    'timeEnd',
    'verbose',
  ]
  
export const consoleMessagesSchema = {
  pageSize: zod
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Maximum number of messages to return. When omitted, returns all requests.',
    ),
  pageIdx: zod
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Page number to return (0-based). When omitted, returns the first page.',
    ),
  types: zod
    .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
    .optional()
    .describe(
      'Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.',
    ),
};

const FILTERABLE_RESOURCE_TYPES: readonly [ResourceType, ...ResourceType[]] = [
  'document',
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'texttrack',
  'xhr',
  'fetch',
  'prefetch',
  'eventsource',
  'websocket',
  'manifest',
  'signedexchange',
  'ping',
  'cspviolationreport',
  'preflight',
  'fedcm',
  'other',
];

export const networkRequestsSchema = {
  pageSize: zod
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Maximum number of requests to return. When omitted, returns all requests.',
    ),
  pageIdx: zod
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Page number to return (0-based). When omitted, returns the first page.',
    ),
  resourceTypes: zod
    .array(zod.enum(FILTERABLE_RESOURCE_TYPES))
    .optional()
    .describe(
      'Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.',
    ),
}