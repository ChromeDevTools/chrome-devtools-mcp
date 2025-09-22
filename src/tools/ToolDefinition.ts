/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';
import {Dialog, ElementHandle, Page} from 'puppeteer-core';
import {ToolCategories} from './categories.js';
import {TraceResult} from '../trace-processing/parse.js';

export interface ToolDefinition<
  Schema extends Zod.ZodRawShape = Zod.ZodRawShape,
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

export interface Request<Schema extends Zod.ZodRawShape> {
  params: z.objectOutputType<Schema, z.ZodTypeAny>;
}

export type ImageContentData = {
  data: string;
  mimeType: string;
};

export interface Response {
  appendResponseLine(value: string): void;
  setIncludePages(value: boolean): void;
  setIncludeNetworkRequests(value: boolean): void;
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
  setSelectedPageIdx(idx: number): void;
  getElementByUid(uid: string): Promise<ElementHandle<Element>>;
  setNetworkConditions(conditions: string | null): void;
  setCpuThrottlingRate(rate: number): void;
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    mimeType: 'image/png' | 'image/jpeg',
  ): Promise<{filename: string}>;
  waitForEventsAfterAction(action: () => Promise<unknown>): Promise<void>;
}>;

export function defineTool<Schema extends Zod.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}
