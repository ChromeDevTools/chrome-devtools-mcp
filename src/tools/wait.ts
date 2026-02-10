/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

const WaitOutputSchema = zod.object({
  elapsed_ms: zod.number(),
  requested_ms: zod.number(),
  reason: zod.string().optional(),
});

export const wait = defineTool({
  name: 'wait',
  description: `Wait for a specified duration before continuing. Useful for giving the page time to update, animations to complete, or network requests to settle.

Args:
  - durationMs (number): Duration in milliseconds (0-30000)
  - reason (string): Optional explanation for the wait
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { elapsed_ms, requested_ms, reason? }
  Markdown format: "Waited Xms" or "Waited Xms (reason)"

Examples:
  - "Wait for animation" -> { durationMs: 500, reason: "animation to complete" }
  - "Wait for API response" -> { durationMs: 2000, reason: "network request to settle" }

Error Handling:
  - Duration must be between 0 and 30000ms`,
  timeoutMs: 35000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['standalone'],
  },
  schema: {
    response_format: responseFormatSchema,
    durationMs: zod
      .number()
      .int()
      .min(0)
      .max(30000)
      .describe(
        'Duration to wait in milliseconds. Must be between 0 and 30000 (30 seconds).',
      ),
    reason: zod
      .string()
      .optional()
      .describe(
        'Optional reason for waiting (e.g., "waiting for animation to complete"). Included in the response for context.',
      ),
  },
  outputSchema: WaitOutputSchema,
  handler: async (request, response) => {
    const {durationMs, reason} = request.params;
    const startTime = Date.now();

    await new Promise(resolve => setTimeout(resolve, durationMs));

    const elapsed = Date.now() - startTime;

    if (request.params.response_format === ResponseFormat.JSON) {
      const output = {
        elapsed_ms: elapsed,
        requested_ms: durationMs,
        ...(reason ? { reason } : {}),
      };
      response.appendResponseLine(JSON.stringify(output, null, 2));
      return;
    }

    if (reason) {
      response.appendResponseLine(`Waited ${elapsed}ms (${reason}).`);
    } else {
      response.appendResponseLine(`Waited ${elapsed}ms.`);
    }
  },
});
