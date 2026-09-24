/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../config/mcp-options.js';
import {Mutex, zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';
import {ToolHandler} from '../ToolHandler.js';

import {ToolCategory} from './categories.js';
import type {
  Context,
  DefinedPageTool,
  ToolDefinition,
} from './ToolDefinition.js';
import {definePageTool} from './ToolDefinition.js';

type ReplDispatcher = (toolName: string, paramsJson: string) => Promise<string>;

const pageReplDispatchers = new WeakMap<Page, ReplDispatcher>();

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function formatReplToolDoc(tool: ToolDefinition | DefinedPageTool): string {
  const paramNames = Object.keys(tool.schema);
  const requiredParams: string[] = [];
  for (const [key, schemaField] of Object.entries(tool.schema)) {
    if (key === 'pageId') {
      continue;
    }
    if (schemaField && !zod.safeParse(schemaField, undefined).success) {
      requiredParams.push(key);
    }
  }
  const paramsHint =
    paramNames.length === 0
      ? ''
      : requiredParams.length === 0
        ? `params?: {${paramNames.join(', ')}}`
        : `params: {${paramNames.map(k => (requiredParams.includes(k) ? k : `${k}?`)).join(', ')}}`;
  const summaryLine = tool.description.split('\n')[0] ?? tool.description;
  return `- \`await ${tool.name}(${paramsHint})\`: ${summaryLine}`;
}

function buildReplDescription(
  baseDescription: string,
  replTools?: Array<ToolDefinition | DefinedPageTool>,
): string {
  if (!replTools || replTools.length === 0) {
    return baseDescription;
  }
  const toolDocs = replTools.map(formatReplToolDoc).join('\n');
  return `${baseDescription}

In REPL mode, all enabled MCP tools are exposed as global async functions inside the evaluated function (e.g., \`await take_snapshot()\`, \`await click({uid: "1_1"})\`).
For page-scoped tools, \`pageId\` defaults to the current page when omitted.
Each function returns the tool's \`structuredContent\` (or text output string if none) and throws an Error if the tool fails.
Available MCP tool functions:
${toolDocs}`;
}

function buildReplWrapperInitScript(toolNames: string[]): string {
  const serializedNames = JSON.stringify(toolNames);
  return `(() => {
    const names = ${serializedNames};
    for (const name of names) {
      globalThis[name] = async (params = {}) => {
        const raw = await globalThis.__mcpCallTool(
          name,
          JSON.stringify(params ?? {}),
        );
        const parsed = JSON.parse(raw);
        if (!parsed.ok) {
          throw new Error(parsed.error || ('Tool ' + name + ' failed'));
        }
        return parsed.result;
      };
    }
  })()`;
}

async function ensureReplBindings(
  page: Page,
  cliArgs: ParsedArguments,
  replTools: Array<ToolDefinition | DefinedPageTool>,
  context: Context,
  defaultPageId: number,
): Promise<void> {
  const replMutex = new Mutex();
  const toolHandlers = new Map<string, ToolHandler>();
  const toolNames: string[] = [];

  for (const tool of replTools) {
    toolNames.push(tool.name);
    toolHandlers.set(
      tool.name,
      new ToolHandler(tool, cliArgs, async () => context, replMutex),
    );
  }

  const dispatcher: ReplDispatcher = async (
    toolName: string,
    paramsJson: string,
  ): Promise<string> => {
    using _guard = await replMutex.acquire();
    const handler = toolHandlers.get(toolName);
    if (!handler) {
      return JSON.stringify({
        ok: false,
        error: `Unknown MCP tool: ${toolName}`,
      });
    }
    let parsedParams: Record<string, unknown> = {};
    if (paramsJson) {
      const rawParsed: unknown = JSON.parse(paramsJson);
      if (isRecord(rawParsed)) {
        parsedParams = rawParsed;
      }
    }
    const result = await handler.execute(parsedParams, {
      defaultPageId,
      validateSchema: true,
      alwaysIncludeStructuredContent: true,
    });
    const textOutput = result.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');

    if (result.isError) {
      return JSON.stringify({
        ok: false,
        error: textOutput || `Tool ${toolName} failed`,
      });
    }

    const structured = result.structuredContent;
    const hasStructuredKeys =
      structured !== undefined && Object.keys(structured).length > 0;
    return JSON.stringify({
      ok: true,
      result: hasStructuredKeys ? structured : textOutput,
    });
  };

  const alreadyExposed = pageReplDispatchers.has(page);
  pageReplDispatchers.set(page, dispatcher);

  const wrapperScript = buildReplWrapperInitScript(toolNames);

  if (!alreadyExposed) {
    await page.exposeFunction(
      '__mcpCallTool',
      async (toolName: string, paramsJson: string): Promise<string> => {
        const activeDispatcher = pageReplDispatchers.get(page);
        if (!activeDispatcher) {
          return JSON.stringify({
            ok: false,
            error: 'REPL dispatcher is not active for this page',
          });
        }
        return await activeDispatcher(toolName, paramsJson);
      },
    );
    await page.evaluateOnNewDocument(wrapperScript);
  }

  await page.evaluate(wrapperScript);
}

export const evaluateScript = (
  cliArgs: ParsedArguments,
  replTools?: Array<ToolDefinition | DefinedPageTool>,
) =>
  definePageTool((args: ParsedArguments) => {
    const baseDescription =
      'Evaluate a JavaScript function inside the target page. Returns the response as JSON, so returned values have to be JSON-serializable.';
    return {
      name: 'evaluate_script',
      description: buildReplDescription(baseDescription, replTools),
      annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
        conditions: ['javascriptEvaluation', 'repl'],
      },
      schema: {
        function: zod.string().describe(
          `A JavaScript function declaration to be executed by the tool in the target page.
Example: \`async () => await list_pages()\`
`,
        ),
      },
      blockedByDialog: true,
      verifyFilesSchema: {},
      handler: async (request, response, context) => {
        const mcpPage = request.page;
        const page = mcpPage.pptrPage;

        if (replTools && replTools.length > 0) {
          await ensureReplBindings(page, args, replTools, context, mcpPage.id);
        }

        using fn = await page.evaluateHandle(`(${request.params.function})`);
        const result = await page.evaluate(async (fn: unknown) => {
          if (typeof fn !== 'function') {
            throw new Error('Evaluated script is not a function');
          }
          return JSON.stringify(await fn());
        }, fn);

        response.appendResponseLine('Script ran on page and returned:');
        response.appendResponseLine('```json');
        response.appendResponseLine(`${result}`);
        response.appendResponseLine('```');
      },
    };
  })(cliArgs);
