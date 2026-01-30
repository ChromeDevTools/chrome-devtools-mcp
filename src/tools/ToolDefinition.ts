/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type z from 'zod';

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
 * Context for extension-only mode (v2.0.0)
 * All browser interaction is via WebSocket relay to Chrome extension.
 * Puppeteer-based methods are no longer available.
 */
export type Context = Readonly<{
  // Performance trace (stub - not supported in extension mode)
  isRunningPerformanceTrace(): boolean;
  setIsRunningPerformanceTrace(x: boolean): void;
  recordedTraces(): unknown[];
  storeTraceRecording(result: unknown): void;

  // Page management (stub - not supported in extension mode)
  getSelectedPage(): never;
  getPages(): never[];
  createPagesSnapshot(): Promise<never[]>;
  getDialog(): undefined;
  clearDialog(): void;
  getPageByIdx(idx: number): never;
  newPage(): Promise<never>;
  closePage(pageIdx: number): Promise<void>;
  setSelectedPageIdx(idx: number): void;
  getElementByUid(uid: string): Promise<never>;

  // Emulation (stub - not supported in extension mode)
  setNetworkConditions(conditions: string | null): void;
  setCpuThrottlingRate(rate: number): void;

  // File operations (stub - not supported in extension mode)
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    mimeType: 'image/png' | 'image/jpeg',
  ): Promise<{filename: string}>;

  // Event handling (stub - not supported in extension mode)
  waitForEventsAfterAction(action: () => Promise<unknown>): Promise<void>;
}>;

export function defineTool<Schema extends z.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}

export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';
