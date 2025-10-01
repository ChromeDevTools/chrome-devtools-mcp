/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Dialog, ElementHandle, Page} from 'puppeteer-core';
import z from 'zod';

import type {TraceResult} from '../trace-processing/parse.js';

import type {ToolCategories} from './categories.js';

export interface ToolDefinition<Schema extends z.ZodRawShape = z.ZodRawShape> {
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

export interface Request<Schema extends z.ZodRawShape> {
  params: z.objectOutputType<Schema, z.ZodTypeAny>;
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
    options?: {pageSize?: number; pageIdx?: number; resourceTypes?: string[]},
  ): void;
  setIncludeConsoleData(value: boolean): void;
  setIncludeSnapshot(value: boolean): void;
  attachImage(value: ImageContentData): void;
  attachNetworkRequest(url: string): void;
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

export function defineTool<Schema extends z.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}

export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';

export const timeoutSchema = {
  timeout: z
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
