/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

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
  ) => Promise<void>;
}

export interface Request<Schema extends zod.ZodRawShape> {
  params: zod.output<zod.ZodObject<Schema>>;
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
  attachImage(value: ImageContentData): void;
  /**
   * Call to skip appending the process ledger to this response.
   * Use for JSON-format responses to avoid corrupting output.
   */
  setSkipLedger(): void;
}

export function defineTool<Schema extends zod.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}

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
 * Shared schema for the logFormat parameter.
 * Used by tools that return log/output content with automatic consolidation.
 * Powered by LogPare's Drain algorithm for semantic log compression.
 */
export const logFormatSchema = zod
  .enum(['summary', 'detailed', 'json'])
  .optional()
  .default('summary')
  .describe(
    "Log compression format. 'summary' (default): compact overview with top templates + rare events. " +
    "'detailed': full template list with sample variables & metadata (URLs, status codes, durations). " +
    "'json': machine-readable JSON with complete template data.",
  );

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
