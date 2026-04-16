/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
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
      stashedElements?: Element[];
      executeTool?: (
        toolName: string,
        args: Record<string, unknown>,
      ) => unknown;
    };
  }
}

export const listInPageTools = definePageTool({
  name: 'list_in_page_tools',
  description: `Lists all in-page tools the page exposes for providing runtime information.
  In-page tools can be called via the 'execute_in_page_tool()' MCP tool.
  Alternatively, in-page tools can be executed by calling 'evaluate_script' and adding the
  following command to the script:
  'window.__dtmcp.executeTool(toolName, params)'
  This might be helpful when the in-page-tools return non-serializable values or when composing
  the in-page-tools with additional functionality.`,
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
  description: `Executes a tool exposed by the page.`,
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
  handler: async (request, response, context) => {
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

        const stashDOMElement = (el: Element) => {
          if (!window.__dtmcp) {
            window.__dtmcp = {};
          }
          if (window.__dtmcp.stashedElements === undefined) {
            window.__dtmcp.stashedElements = [];
          }
          window.__dtmcp.stashedElements.push(el);
          return {
            stashedId: `stashed-${window.__dtmcp.stashedElements.length - 1}`,
          };
        };

        const ancestors: unknown[] = [];
        // Recursively walks the tool result:
        // - Replaces DOM elements with an ID and stashes the DOM element on the window object
        // - Replaces non-plain objects with a string representation of the object
        // - Replaces circular references with the string '<Circular reference>'
        // - Replaces functions with the string '<Function object>'
        const processToolResult = (
          data: unknown,
          parentEl?: unknown,
        ): unknown => {
          // 1. Handle DOM Elements
          if (data instanceof Element) {
            return stashDOMElement(data);
          }

          // 2. Handle Arrays
          if (Array.isArray(data)) {
            return data.map((item: unknown) =>
              processToolResult(item, parentEl),
            );
          }

          // 3. Handle Objects
          if (data !== null && typeof data === 'object') {
            while (ancestors.length > 0 && ancestors.at(-1) !== parentEl) {
              ancestors.pop();
            }
            if (ancestors.includes(data)) {
              return '<Circular reference>';
            }
            ancestors.push(data);

            // If not a plain object, return a string representation of the object
            if (Object.getPrototypeOf(data) !== Object.prototype) {
              return `<${data.constructor.name} instance>`;
            }

            const processedObj: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(data)) {
              processedObj[key] = processToolResult(value, data);
            }
            return processedObj;
          }

          // 4. Handle Functions
          if (typeof data === 'function') {
            return '<Function object>';
          }

          // 5. Return primitives (strings, numbers, booleans) as-is
          return data;
        };

        return {
          result: processToolResult(toolResult),
          stashed: window.__dtmcp?.stashedElements?.length ?? 0,
        };
      },
      toolName,
      params,
      ...handles,
    );

    const elementHandles: ElementHandle[] = [];
    for (let i = 0; i < (result.stashed ?? 0); i++) {
      const elementHandle = await request.page.pptrPage.evaluateHandle(
        index => {
          return window.__dtmcp?.stashedElements?.[index] ?? null;
        },
        i,
      );
      elementHandles.push(elementHandle as ElementHandle);
    }
    const resultWithStashedElements = result.result;

    let isPageSnapshotUpdated = false;
    const stashedToUid = async (index: number) => {
      const backendNodeId = await elementHandles[index].backendNodeId();
      if (!backendNodeId) {
        logger(`No backendNodeId for stashed DOM element with index ${index}`);
        return {uid: `stashed-${index}`};
      }
      let cdpElementId = context.resolveCdpElementId(
        request.page,
        backendNodeId,
      );
      if (!cdpElementId) {
        await context.createTextSnapshot(
          request.page,
          false,
          undefined,
          elementHandles,
        );
        isPageSnapshotUpdated = true;
        cdpElementId = context.resolveCdpElementId(request.page, backendNodeId);
      }
      if (!cdpElementId) {
        logger(`Could not get cdpElementId for backend node ${backendNodeId}`);
        return {uid: `stashed-${index}`};
      }
      return {uid: cdpElementId};
    };

    const recursivelyReplaceStashedElements = async (
      node: unknown,
    ): Promise<unknown> => {
      if (Array.isArray(node)) {
        return await Promise.all(
          node.map(async x => await recursivelyReplaceStashedElements(x)),
        );
      }
      if (node !== null && typeof node === 'object') {
        if (
          'stashedId' in node &&
          typeof node.stashedId === 'string' &&
          node.stashedId.startsWith('stashed-') &&
          Object.keys(node).length === 1
        ) {
          const index = parseInt(node.stashedId.split('-')[1]);
          return stashedToUid(index);
        }
        const resultObj: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(node)) {
          resultObj[key] = await recursivelyReplaceStashedElements(value);
        }
        return resultObj;
      }
      return node;
    };

    const resultWithUids = await recursivelyReplaceStashedElements(
      resultWithStashedElements,
    );
    response.appendResponseLine(JSON.stringify(resultWithUids, null, 2));
    if (isPageSnapshotUpdated) {
      response.includeSnapshot();
    }
  },
});
