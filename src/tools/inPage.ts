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
}

export interface ToolGroup<T extends ToolDefinition> {
  name: string;
  description: string;
  tools: T[];
}

declare global {
  interface Window {
    __dtmcp?: {
      toolGroup?: ToolGroup<
        ToolDefinition & {execute: (args: Record<string, unknown>) => unknown}
      >;
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
  To call 'list_in_page_tools', call 'evaluate_script' with
  'window.__dtmcp.executeTool("list_in_page_tools", {})'.`,
  annotations: {
    category: ToolCategory.IN_PAGE,
    readOnlyHint: true,
    conditions: ['inPageTools'],
  },
  schema: {},
  handler: async (_request, response, _context) => {
    response.setListInPageTools();
  },
});
