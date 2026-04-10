/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const listWebMcpTools = definePageTool({
  name: 'list_webmcp_tools',
  description: `Lists all WebMCP tools the page exposes.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalWebmcp'],
  },
  schema: {},
  handler: async (_request, response, _context) => {
    response.setListWebMcpTools();
  },
});
