/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * A tool for listing all console messages for the currently selected page.
 * @public
 */
export const consoleTool = defineTool({
  name: 'list_console_messages',
  description: 'List all console messages for the currently selected page',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response) => {
    response.setIncludeConsoleData(true);
  },
});
