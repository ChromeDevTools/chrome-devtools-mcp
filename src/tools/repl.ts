/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../config/ConfigParser.js';
import {McpContext} from '../McpContext.js';
import {Mutex, zod} from '../third_party/index.js';
import type {Page, Protocol} from '../third_party/index.js';
import {ToolHandler} from '../ToolHandler.js';

import {ToolCategory} from './categories.js';
import type {
  DefinedPageTool,
  Response,
  ToolDefinition,
} from './ToolDefinition.js';
import {definePageTool} from './ToolDefinition.js';

type ReplDispatcher = (toolName: string, paramsJson: string) => Promise<string>;

/** The dispatcher serving `__mcpCallTool` binding calls for the current evaluation. */
const replDispatchers = new WeakMap<Page, ReplDispatcher>();

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isZodType(val: unknown): val is zod.core.$ZodType {
  return typeof val === 'object' && val !== null && '_zod' in val;
}

function isOptionalSchema(schema: zod.core.$ZodType): boolean {
  return schema._zod.optin === 'optional';
}

function firstLine(text: string | undefined): string | undefined {
  const line = text?.split('\n')[0]?.trim();
  return line ? line : undefined;
}

/**
 * Renders a zod schema as a TypeScript type expression. Supports the subset
 * of zod used by tool schemas; anything else falls back to `unknown`.
 */
function zodToTs(schema: zod.core.$ZodType, indent: string): string {
  const def = schema._zod.def;
  switch (def.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'int':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'literal':
      return 'values' in def && Array.isArray(def.values)
        ? def.values.map(value => JSON.stringify(value)).join(' | ')
        : 'unknown';
    case 'enum':
      return 'entries' in def && isRecord(def.entries)
        ? Object.values(def.entries)
            .map(value => JSON.stringify(value))
            .join(' | ')
        : 'string';
    case 'optional':
    case 'nullable':
    case 'default': {
      if (!('innerType' in def) || !isZodType(def.innerType)) {
        return 'unknown';
      }
      const inner = zodToTs(def.innerType, indent);
      return def.type === 'nullable' ? `${inner} | null` : inner;
    }
    case 'array': {
      if (!('element' in def) || !isZodType(def.element)) {
        return 'unknown[]';
      }
      const element = zodToTs(def.element, indent);
      return element.includes(' | ') ? `Array<${element}>` : `${element}[]`;
    }
    case 'union':
      return 'options' in def && Array.isArray(def.options)
        ? def.options
            .filter(isZodType)
            .map(option => zodToTs(option, indent))
            .join(' | ')
        : 'unknown';
    case 'record':
      return 'valueType' in def && isZodType(def.valueType)
        ? `Record<string, ${zodToTs(def.valueType, indent)}>`
        : 'Record<string, unknown>';
    case 'object':
      return 'shape' in def && isRecord(def.shape)
        ? zodShapeToTs(def.shape, indent)
        : 'object';
    default:
      return 'unknown';
  }
}

function zodShapeToTs(shape: Record<string, unknown>, indent: string): string {
  const inner = `${indent}  `;
  const lines: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    if (!isZodType(field)) {
      continue;
    }
    const description = firstLine(zod.globalRegistry.get(field)?.description);
    if (description) {
      lines.push(`${inner}/** ${description} */`);
    }
    const optional = isOptionalSchema(field) ? '?' : '';
    lines.push(`${inner}${key}${optional}: ${zodToTs(field, inner)};`);
  }
  return lines.length === 0 ? '{}' : `{\n${lines.join('\n')}\n${indent}}`;
}

/**
 * Generates a TypeScript method signature for a tool. `pageId` is omitted
 * because the REPL defaults it to the current page.
 */
function formatReplToolSignature(
  tool: ToolDefinition | DefinedPageTool,
): string {
  const shape: Record<string, unknown> = {};
  let hasRequired = false;
  for (const [key, field] of Object.entries(tool.schema)) {
    if (key === 'pageId' || !isZodType(field)) {
      continue;
    }
    shape[key] = field;
    hasRequired ||= !isOptionalSchema(field);
  }
  const lines: string[] = [];
  const description = firstLine(tool.description);
  if (description) {
    lines.push(`  /** ${description} */`);
  }
  const params =
    Object.keys(shape).length === 0
      ? ''
      : `params${hasRequired ? '' : '?'}: ${zodShapeToTs(shape, '  ')}`;
  lines.push(`  ${tool.name}(${params}): Promise<ToolResult>;`);
  return lines.join('\n');
}

const TOOL_RESULT_DECLARATION = `/**
 * Resolved value of every \`mcp.*\` call: the tool's structuredContent, or its
 * text output when the tool produces no structured data. Only the keys that
 * apply to the invoked tool are present.
 */
type ToolResult =
  | string
  | {
      message?: string;
      snapshot?: {id: string; role: string; name?: string; children?: object[]};
      snapshotFilePath?: string;
      pages?: Array<{id: number; url: string; title?: string; selected?: boolean}>;
      openedPages?: object[];
      navigatedToUrl?: string;
      networkRequest?: object;
      networkRequests?: object[];
      consoleMessage?: object;
      consoleMessages?: object[];
      pagination?: object;
      traceSummary?: string;
      traceInsights?: Array<{insightName: string; insightKey?: string}>;
      lighthouseResult?: object;
      matchedStyles?: object;
      dialog?: {type: string; message: string; defaultValue?: string};
      extensions?: object[];
      viewport?: object;
      userAgent?: string;
      networkConditions?: string;
      cpuThrottlingRate?: number;
      geolocation?: {latitude: number; longitude: number};
      errorMessage?: string;
      [key: string]: unknown;
    };`;

const CONSOLE_UTILITIES_DECLARATION = `/**
 * DevTools Console Utilities. They are in scope inside the evaluated function
 * by their usual names, exactly as in the DevTools Console, and keep working
 * after \`await\`.
 */
/** Lists the event listeners registered on the target, keyed by event type. */
declare function getEventListeners(target: EventTarget): Record<string, Array<{
  listener: Function;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  type: string;
}>>;
/** Computed accessible name of the node ("" when it has none). */
declare function getAccessibleName(node: Node): string;
/** Computed ARIA role of the node. */
declare function getAccessibleRole(node: Node): string;
/** Logs the given events (or all events) fired on the target to the console. */
declare function monitorEvents(target: EventTarget, events?: string | string[]): void;
declare function unmonitorEvents(target: EventTarget, events?: string | string[]): void;
/** Evaluates an XPath expression and returns the matching nodes. */
declare function $x(xpath: string, startNode?: Node): Node[];
/** document.querySelector, unless the page defines its own \`$\`. */
declare function $(selector: string, startNode?: Node): Element | null;
/** document.querySelectorAll as an array, unless the page defines its own \`$$\`. */
declare function $$(selector: string, startNode?: Node): Element[];
/** The element currently selected in the DevTools Elements panel, if any. */
declare const $0: Element | undefined;`;

function buildReplDescription(
  baseDescription: string,
  replTools: Array<ToolDefinition | DefinedPageTool>,
): string {
  const methods = replTools.map(formatReplToolSignature).join('\n\n');
  return `${baseDescription}

In REPL mode, the evaluated function receives one argument, \`mcp\`, which exposes all enabled MCP tools as async methods (e.g., \`async (mcp) => { await mcp.take_snapshot(); await mcp.click({uid: "1_1"}); }\`). The DevTools Console Utilities (${CONSOLE_UTILITIES.join(', ')}) are in scope by their usual names, as in the DevTools Console (e.g., \`getEventListeners(document.body)\`, \`getAccessibleName(el)\`). Nothing is added to the page's global scope.
For page-scoped tools, \`pageId\` defaults to the current page when omitted.
Each \`mcp\` method resolves to the tool's \`structuredContent\` (or its text output when there is none) and throws an Error if the tool fails.
Images produced by inner tool calls (e.g., \`mcp.take_screenshot()\` without \`filePath\`) are attached to this tool's response.

TypeScript declarations of the available API:
\`\`\`ts
${TOOL_RESULT_DECLARATION}

/** MCP tools, exposed as the first argument of the evaluated function. */
interface McpTools {
${methods}
}

${CONSOLE_UTILITIES_DECLARATION}

/** Signature of the evaluated function. */
type ReplScript = (mcp: McpTools) => unknown | Promise<unknown>;
\`\`\``;
}

/**
 * DevTools Console Utilities bound into the evaluated function's scope. They
 * are only installed by `Runtime.evaluate({includeCommandLineAPI: true})` and
 * V8 removes them from the global object once that evaluation's synchronous
 * part returns, so the wrapper captures them synchronously as closure
 * parameters of the user function.
 */
const CONSOLE_UTILITIES: readonly string[] = [
  'getEventListeners',
  'getAccessibleName',
  'getAccessibleRole',
  'monitorEvents',
  'unmonitorEvents',
  '$x',
  '$',
  '$$',
  '$0',
];

/**
 * Builds the expression that `Runtime.evaluate({includeCommandLineAPI: true})`
 * runs. It evaluates to a holder object `{fn, mcp}` where:
 *
 * - `mcp` is a frozen namespace whose methods forward to the exposed
 *   `__mcpCallTool` binding;
 * - `fn` is the user function, created inside an IIFE whose parameters shadow
 *   the Console Utilities with the values captured while the Command Line API
 *   is installed, so bare names like `getEventListeners` keep working after
 *   the first `await`.
 *
 * Nothing is written to the page's global scope.
 */
function buildReplEvaluationScript(
  fnSource: string,
  toolNames: string[],
): string {
  const utilityParams = CONSOLE_UTILITIES.join(', ');
  const utilityArgs = CONSOLE_UTILITIES.map(
    name => `typeof ${name} === 'undefined' ? undefined : ${name}`,
  ).join(',\n      ');
  return `(() => {
    const callTool = async (name, params) => {
      const raw = await globalThis.__mcpCallTool(name, JSON.stringify(params));
      const parsed = JSON.parse(raw);
      if (!parsed.ok) {
        throw new Error(parsed.error || ('Tool ' + name + ' failed'));
      }
      return parsed.result;
    };

    const mcp = Object.create(null);
    for (const name of ${JSON.stringify(toolNames)}) {
      mcp[name] = (params = {}) => callTool(name, params ?? {});
    }
    Object.freeze(mcp);

    const fn = ((${utilityParams}) => (${fnSource}))(
      ${utilityArgs}
    );
    return {fn, mcp};
  })()`;
}

function throwIfException(
  exceptionDetails: Protocol.Runtime.ExceptionDetails | undefined,
): void {
  if (!exceptionDetails) {
    return;
  }
  const exception = exceptionDetails.exception;
  if (exception?.description !== undefined) {
    throw new Error(exception.description);
  }
  if (exception?.value !== undefined) {
    throw new Error(String(exception.value));
  }
  throw new Error(exceptionDetails.text);
}

/**
 * Evaluates the user function in the page's main world with the Console
 * Utilities in scope and the `mcp` namespace as its argument.
 *
 * Puppeteer's `page.evaluate(fn)` uses `Runtime.callFunctionOn`, which never
 * installs the Console Utilities, so this talks CDP directly on a dedicated
 * session: one `Runtime.evaluate({includeCommandLineAPI: true})` to build the
 * holder object, then one `Runtime.callFunctionOn` to run the function.
 */
async function evaluateReplFunction(
  page: Page,
  fnSource: string,
  toolNames: string[],
): Promise<string> {
  const client = await page.createCDPSession();
  try {
    const holder = await client.send('Runtime.evaluate', {
      expression: buildReplEvaluationScript(fnSource, toolNames),
      includeCommandLineAPI: true,
    });
    throwIfException(holder.exceptionDetails);
    if (holder.result.objectId === undefined) {
      throw new Error('Failed to prepare the REPL evaluation');
    }

    const evaluation = await client.send('Runtime.callFunctionOn', {
      objectId: holder.result.objectId,
      functionDeclaration: `async function () {
        if (typeof this.fn !== 'function') {
          throw new Error('Evaluated script is not a function');
        }
        return JSON.stringify(await this.fn(this.mcp));
      }`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    throwIfException(evaluation.exceptionDetails);
    return String(evaluation.result.value);
  } finally {
    await client.detach().catch(() => {});
  }
}

/**
 * Creates the dispatcher that serves `__mcpCallTool` binding calls for one
 * evaluation: it validates the parameters, runs the tool through a regular
 * `ToolHandler`, forwards any images to the outer response, and returns the
 * result as JSON for the page.
 */
function createReplDispatcher(
  cliArgs: ParsedArguments,
  replTools: Array<ToolDefinition | DefinedPageTool>,
  context: McpContext,
  defaultPageId: number,
  outerResponse: Response,
): ReplDispatcher {
  const replMutex = new Mutex();
  const toolHandlers = new Map<string, ToolHandler>();
  for (const tool of replTools) {
    toolHandlers.set(
      tool.name,
      new ToolHandler(
        tool,
        // The page reads tool results from structuredContent.
        {...cliArgs, experimentalStructuredContent: true},
        async () => context,
        replMutex,
        // The REPL reuses an already-resolved context, so there is no
        // browser connection attempt to forget or abandon on timeout.
        () => {},
        () => {},
      ),
    );
  }

  return async (toolName, paramsJson) => {
    try {
      const rawParams: unknown = JSON.parse(paramsJson);
      const params = isRecord(rawParams) ? rawParams : {};
      const handler = toolHandlers.get(toolName);
      if (!handler) {
        throw new Error(`Unknown MCP tool: ${toolName}`);
      }
      if ('pageId' in handler.inputSchema && params.pageId === undefined) {
        params.pageId = defaultPageId;
      }
      const parsed = handler.registeredInputSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(zod.prettifyError(parsed.error));
      }
      const result = await handler.handle(parsed.data);

      const textOutput = result.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
      // The page only receives JSON text, so binary content (e.g. inline
      // screenshots) is forwarded to the outer evaluate_script response.
      for (const item of result.content) {
        if (item.type === 'image') {
          outerResponse.attachImage({data: item.data, mimeType: item.mimeType});
        }
      }
      if (result.isError) {
        throw new Error(textOutput || `Tool ${toolName} failed`);
      }
      const structured = result.structuredContent;
      const hasStructuredKeys =
        isRecord(structured) && Object.keys(structured).length > 0;
      return JSON.stringify({
        ok: true,
        result: hasStructuredKeys ? structured : textOutput,
      });
    } catch (err) {
      return JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

/**
 * Installs the `__mcpCallTool` binding once per page and points it at the
 * dispatcher of the current evaluation.
 */
async function setReplDispatcher(
  page: Page,
  dispatcher: ReplDispatcher,
): Promise<void> {
  const alreadyExposed = replDispatchers.has(page);
  replDispatchers.set(page, dispatcher);
  if (alreadyExposed) {
    return;
  }
  await page.exposeFunction(
    '__mcpCallTool',
    async (toolName: string, paramsJson: string): Promise<string> => {
      const active = replDispatchers.get(page);
      if (!active) {
        return JSON.stringify({ok: false, error: 'REPL is not active'});
      }
      return await active(toolName, paramsJson);
    },
  );
}

export const evaluateScript = (
  cliArgs: ParsedArguments,
  replTools: Array<ToolDefinition | DefinedPageTool> = [],
): DefinedPageTool =>
  definePageTool((args: ParsedArguments) => {
    const toolNames = replTools.map(tool => tool.name);
    return {
      name: 'evaluate_script',
      description: buildReplDescription(
        'Evaluate a JavaScript function inside the target page. Returns the response as JSON, so returned values have to be JSON-serializable.',
        replTools,
      ),
      annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
        conditions: ['javascriptEvaluation', 'repl'],
      },
      schema: {
        function: zod.string().describe(
          `A JavaScript function declaration to be executed by the tool in the target page. In REPL mode it receives the \`mcp\` namespace as its only argument and has the DevTools Console Utilities in scope (see the \`ReplScript\` type in the tool description).
Example: \`async (mcp) => await mcp.list_pages()\`
`,
        ),
      },
      blockedByDialog: true,
      verifyFilesSchema: {},
      handler: async (request, response, context) => {
        // ToolHandler always passes the real McpContext; the inner
        // ToolHandlers created for the REPL need it too.
        if (!(context instanceof McpContext)) {
          throw new Error('REPL mode requires an McpContext');
        }
        const mcpPage = request.page;
        const page = mcpPage.pptrPage;

        await setReplDispatcher(
          page,
          createReplDispatcher(args, replTools, context, mcpPage.id, response),
        );

        const result = await evaluateReplFunction(
          page,
          request.params.function,
          toolNames,
        );

        response.appendResponseLine('Script ran on page and returned:');
        response.appendResponseLine('```json');
        response.appendResponseLine(`${result}`);
        response.appendResponseLine('```');
      },
    };
  })(cliArgs);
