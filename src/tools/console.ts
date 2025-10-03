/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const consoleTool = defineTool({
  name: 'list_console_messages',
  description:
    'List console messages for the currently selected page with filtering options',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    level: z
      .enum(['log', 'info', 'warning', 'error', 'all'])
      .optional()
      .describe('Filter by log level (default: all)'),
    limit: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of messages to return (default: 100)'),
    compact: z
      .boolean()
      .optional()
      .describe('Use compact format to reduce token usage (default: true)'),
    includeTimestamp: z
      .boolean()
      .optional()
      .describe('Include timestamp information (default: false)'),
  },
  handler: async (request, response) => {
    const params = request.params as {
      level?: string;
      limit?: number;
      compact?: boolean;
      includeTimestamp?: boolean;
    };

    // Always pass options to enable compact mode by default
    response.setIncludeConsoleData(true, {
      level: params.level || 'all',
      limit: params.limit || 100,
      compact: params.compact ?? true, // Default to true
      includeTimestamp: params.includeTimestamp ?? false,
    });
  },
});
