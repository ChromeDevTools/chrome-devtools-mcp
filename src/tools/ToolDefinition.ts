/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Dialog, ElementHandle, Page} from 'puppeteer-core';
import z from 'zod';

import type {TraceResult} from '../trace-processing/parse.js';

import type {ToolCategories} from './categories.js';

/**
 * Defines the structure of a tool that can be registered with the MCP server.
 *
 * @template Schema The Zod schema for the tool's parameters.
 * @public
 */
export interface ToolDefinition<Schema extends z.ZodRawShape = z.ZodRawShape> {
  /**
   * The name of the tool.
   */
  name: string;
  /**
   * A description of what the tool does.
   */
  description: string;
  /**
   * Annotations providing additional metadata about the tool.
   */
  annotations: {
    /**
     * The title of the tool.
     */
    title?: string;
    /**
     * The category the tool belongs to.
     */
    category: ToolCategories;
    /**
     * If true, the tool does not modify its environment.
     */
    readOnlyHint: boolean;
  };
  /**
   * The Zod schema for the tool's parameters.
   */
  schema: Schema;
  /**
   * The handler function that implements the tool's logic.
   */
  handler: (
    request: Request<Schema>,
    response: Response,
    context: Context,
  ) => Promise<void>;
}

/**
 * Represents a request to a tool, containing the parsed parameters.
 *
 * @template Schema The Zod schema for the tool's parameters.
 * @public
 */
export interface Request<Schema extends z.ZodRawShape> {
  /**
   * The parameters for the tool call, validated against the schema.
   */
  params: z.objectOutputType<Schema, z.ZodTypeAny>;
}

/**
 * Represents image data to be included in a response.
 * @public
 */
export interface ImageContentData {
  /**
   * The base64-encoded image data.
   */
  data: string;
  /**
   * The MIME type of the image.
   */
  mimeType: string;
}

/**
 * Defines the interface for a tool to construct its response.
 * @public
 */
export interface Response {
  /**
   * Appends a line of text to the response.
   * @param value - The text to append.
   */
  appendResponseLine(value: string): void;
  /**
   * Specifies whether to include information about open pages in the response.
   * @param value - True to include page information, false otherwise.
   */
  setIncludePages(value: boolean): void;
  /**
   * Specifies whether to include network requests in the response.
   * @param value - True to include network requests, false otherwise.
   * @param options - Options for pagination and filtering of network requests.
   */
  setIncludeNetworkRequests(
    value: boolean,
    options?: {pageSize?: number; pageIdx?: number; resourceTypes?: string[]},
  ): void;
  /**
   * Specifies whether to include console data in the response.
   * @param value - True to include console data, false otherwise.
   */
  setIncludeConsoleData(value: boolean): void;
  /**
   * Specifies whether to include a page content snapshot in the response.
   * @param value - True to include a snapshot, false otherwise.
   */
  setIncludeSnapshot(value: boolean): void;
  /**
   * Attaches an image to the response.
   * @param value - The image data to attach.
   */
  attachImage(value: ImageContentData): void;
  /**
   * Attaches details of a specific network request to the response.
   * @param url - The URL of the network request to attach.
   */
  attachNetworkRequest(url: string): void;
}

/**
 * The context available to a tool during its execution.
 * Only add methods required by tools/*.
 * @public
 */
export type Context = Readonly<{
  /**
   * Checks if a performance trace is currently being recorded.
   */
  isRunningPerformanceTrace(): boolean;
  /**
   * Sets the performance trace recording status.
   */
  setIsRunningPerformanceTrace(x: boolean): void;
  /**
   * Retrieves all recorded performance traces.
   */
  recordedTraces(): TraceResult[];
  /**
   * Stores a new performance trace result.
   */
  storeTraceRecording(result: TraceResult): void;
  /**
   * Gets the currently selected page.
   */
  getSelectedPage(): Page;
  /**
   * Gets the currently active dialog, if any.
   */
  getDialog(): Dialog | undefined;
  /**
   * Clears the currently active dialog.
   */
  clearDialog(): void;
  /**
   * Gets a page by its index.
   */
  getPageByIdx(idx: number): Page;
  /**
   * Creates a new page.
   */
  newPage(): Promise<Page>;
  /**
   * Closes a page by its index.
   */
  closePage(pageIdx: number): Promise<void>;
  /**
   * Sets the selected page by its index.
   */
  setSelectedPageIdx(idx: number): void;
  /**
   * Gets an element handle by its unique ID from the accessibility snapshot.
   */
  getElementByUid(uid: string): Promise<ElementHandle<Element>>;
  /**
   * Sets the network conditions to emulate.
   */
  setNetworkConditions(conditions: string | null): void;
  /**
   * Sets the CPU throttling rate.
   */
  setCpuThrottlingRate(rate: number): void;
  /**
   * Saves data to a temporary file.
   */
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): Promise<{filename: string}>;
  /**
   * Saves data to a specified file.
   */
  saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}>;
  /**
   * Waits for events to settle after performing an action.
   */
  waitForEventsAfterAction(action: () => Promise<unknown>): Promise<void>;
}>;

/**
 * A helper function for defining a tool with proper type inference.
 *
 * @param definition - The tool definition.
 * @returns The tool definition.
 * @public
 */
export function defineTool<Schema extends z.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}

/**
 * The error message for when an attempt is made to close the last open page.
 * @public
 */
export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';

/**
 * A Zod schema for a timeout parameter.
 * @public
 */
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
