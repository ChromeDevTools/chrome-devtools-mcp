/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  zod,
  ajv,
  type JSONSchema7,
  type ElementHandle,
} from '../third_party/index.js';

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
  description:
    'Discover custom tools published by the page under window.__dtmcp. ' +
    'Call them via execute_in_page_tool or evaluate_script ' +
    '(window.__dtmcp.executeTool).',
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

export const executeInPageTool = definePageTool({
  name: 'execute_in_page_tool',
  description:
    'Run a page-defined __dtmcp tool by name with JSON params; {uid} refs ' +
    'resolve to elements.',
  annotations: {
    category: ToolCategory.IN_PAGE,
    readOnlyHint: false,
    conditions: ['inPageTools'],
  },
  schema: {
    toolName: zod.string().describe('The name of the tool to execute'),
    params: zod
      .string()
      .optional()
      .describe('The JSON-stringified parameters to pass to the tool'),
  },
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

    // Creates array of ElementHandles from the UIDs in the params.
    // We do not replace the uids with the ElementsHandles yet, because
    // the `evaluate` function only turns them into DOM elements if they
    // are passed as non-nested arguments.
    const handles: ElementHandle[] = [];
    for (const value of Object.values(params)) {
      if (
        value instanceof Object &&
        'uid' in value &&
        typeof value.uid === 'string' &&
        Object.keys(value).length === 1
      ) {
        handles.push(await request.page.getElementByUid(value.uid));
      }
    }

    const toolGroup = request.page.getInPageTools();
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

    const result = await request.page.pptrPage.evaluate(
      async (name, args, ...elements) => {
        // Replace the UIDs with DOM elements.
        for (const [key, value] of Object.entries(args)) {
          if (
            value instanceof Object &&
            'uid' in value &&
            typeof value.uid === 'string' &&
            Object.keys(value).length === 1
          ) {
            args[key] = elements.shift();
          }
        }

        if (!window.__dtmcp?.executeTool) {
          throw new Error('No tools found on the page');
        }
        const toolResult = await window.__dtmcp.executeTool(name, args);

        return {
          result: toolResult,
        };
      },
      toolName,
      params,
      ...handles,
    );
    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});
