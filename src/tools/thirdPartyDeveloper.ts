/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod, ajv, type JSONSchema7} from '../third_party/index.js';

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
      stashedElements?: Element[];
      executeTool?: (
        toolName: string,
        args: Record<string, unknown>,
      ) => unknown;
    };
  }
}

export const listThirdPartyDeveloperTools = definePageTool({
  name: 'list_3p_developer_tools',
  description: `Lists all third-party developer tools the page exposes for providing runtime information.
  Third-party developer tools can be called via the 'execute_3p_developer_tool()' MCP tool.
  Alternatively, third-party developer tools can be executed by calling 'evaluate_script' and adding the
  following command to the script:
  'window.__dtmcp.executeTool(toolName, params)'
  This might be helpful when the third-party developer tools return non-serializable values or when composing
  third-party developer tools with additional functionality.`,
  annotations: {
    category: ToolCategory.THIRD_PARTY,
    readOnlyHint: true,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (_request, response, _context) => {
    response.setListThirdPartyDeveloperTools();
  },
});

export const executeThirdPartyDeveloperTool = definePageTool({
  name: 'execute_3p_developer_tool',
  description: `Executes a tool exposed by the page.`,
  annotations: {
    category: ToolCategory.THIRD_PARTY,
    readOnlyHint: false,
  },
  schema: {
    toolName: zod.string().describe('The name of the tool to execute'),
    params: zod
      .string()
      .optional()
      .describe('The JSON-stringified parameters to pass to the tool'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const toolName = request.params.toolName;
    let params: Record<string, unknown> = {};
    if (request.params.params) {
      try {
        const parsed = JSON.parse(request.params.params);
        if (typeof parsed === 'object' && parsed !== null) {
          params = parsed;
        } else {
          throw new Error('Parsed params is not an object');
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to parse params as JSON: ${errorMessage}`);
      }
    }

    const toolGroup = request.page.getThirdPartyDeveloperTools();
    const tool = toolGroup?.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    const ajvInstance = new ajv();
    const validate = ajvInstance.compile(tool.inputSchema);
    const valid = validate(params);
    if (!valid) {
      throw new Error(
        `Invalid parameters for tool ${toolName}: ${ajvInstance.errorsText(validate.errors)}`,
      );
    }

    await request.page.executeThirdPartyDeveloperTool(
      toolName,
      params,
      response,
    );
  },
});
