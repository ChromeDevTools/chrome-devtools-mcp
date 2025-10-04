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
  description: 'List all console messages for the currently selected page',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    tail: z
      .number()
      .int()
      .positive()
      .optional()
      .default(50)
      .describe(
        'Maximum number of recent messages to return. Defaults to 50. Omit or set to null to return all messages.',
      ),
  },
  handler: async (request, response) => {
    response.setIncludeConsoleData(true, request.params.tail);
  },
});
