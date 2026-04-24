/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

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

export const executeWebMcpTool = definePageTool({
  name: 'execute_webmcp_tool',
  description: `Executes a WebMCP tool exposed by the page.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalWebmcp'],
  },
  schema: {
    toolName: zod.string().describe('The name of the WebMCP tool to execute'),
    input: zod
      .string()
      .optional()
      .describe('The JSON-stringified parameters to pass to the WebMCP tool'),
  },
  handler: async (request, response) => {
    const toolName = request.params.toolName;

    let input: Record<string, unknown> = {};
    if (request.params.input) {
      try {
        const parsed = JSON.parse(request.params.input);
        if (typeof parsed === 'object' && parsed !== null) {
          input = parsed;
        } else {
          throw new Error('Parsed input is not an object');
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to parse input as JSON: ${errorMessage}`);
      }
    }

    const tools = request.page.pptrPage.webmcp.tools();
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const {status, output, errorText} = await tool.execute(input);
    response.appendResponseLine(
      JSON.stringify({status, output, errorText}, null, 2),
    );
  },
});
