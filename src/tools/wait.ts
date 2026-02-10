/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const wait = defineTool({
  name: 'wait',
  description:
    'Wait for a specified duration before continuing. Useful for giving the page time to update, animations to complete, or network requests to settle.',
  timeoutMs: 35000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: true,
  },
  schema: {
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
  handler: async (request, response) => {
    const {durationMs, reason} = request.params;
    const startTime = Date.now();

    await new Promise(resolve => setTimeout(resolve, durationMs));

    const elapsed = Date.now() - startTime;

    if (reason) {
      response.appendResponseLine(`Waited ${elapsed}ms (${reason}).`);
    } else {
      response.appendResponseLine(`Waited ${elapsed}ms.`);
    }
  },
});
