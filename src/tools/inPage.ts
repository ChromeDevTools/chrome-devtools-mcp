/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {type JSONSchema7} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  execute: (input: Record<string, unknown>) => unknown;
}

export interface ToolGroup {
  name: string;
  description: string;
  tools: ToolDefinition[];
}

declare global {
  interface Window {
    __dtmcp?: {
      toolGroup?: ToolGroup;
      executeTool?: (
        toolName: string,
        args: Record<string, unknown>,
      ) => unknown;
    };
  }
}

export const listInPageTools = definePageTool({
  name: 'list_in_page_tools',
  description: `Lists all in-page-tools the page exposes for providing runtime information.
  In-page-tools are exposed on the page via the 'window.__dtmcp.executeTool(toolName, params)'
  function where they can be called by 'evaluate_script'.`,
  annotations: {
    category: ToolCategory.IN_PAGE,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, _context) => {
    response.setListInPageTools();
  },
});
