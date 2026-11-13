/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

import type {ParsedArguments} from '../config/mcp-options.js';
import {
  ServerConfig,
  type ReadonlyServerConfig,
} from '../config/ServerConfig.js';
import {McpContext} from '../McpContext.js';
import {McpPage} from '../McpPage.js';
import {McpResponse} from '../McpResponse.js';
import {
  DisposableStack,
  Mutex,
  zod,
  type CDPSession,
  type Protocol,
} from '../third_party/index.js';
import {getNetworkMultiplierFromString} from '../utils/WaitForHelper.js';

import {ToolCategory} from './categories.js';
import {INNER_REPL_TOOL_NAMES, STRIPPED_INNER_PARAMS} from './replPartition.js';
import {
  buildReplApiDeclaration,
  buildStrictRuntimeOutputSchema,
  formatZodOutputValidationError,
} from './replSchema.js';
import {
  definePageTool,
  isBrowserlessTool,
  isPageScopedTool,
  isSlimTool,
  type AnyToolDefinition,
  type Context,
  type Response,
  type ToolSchema,
} from './ToolDefinition.js';

const MAX_REPL_IMAGES = 4;

interface CompletedReplStep {
  tool: string;
  ok: boolean;
  navigatedToUrl?: string;
}

interface ReplBindingMessage {
  seq: number;
  kind: 'tool' | 'getElement' | 'getEventListeners';
  name?: string;
  params?: unknown;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isElementHandleToken(
  value: unknown,
): value is {mcpElementHandle: number} {
  return (
    isPlainRecord(value) &&
    'mcpElementHandle' in value &&
    typeof value.mcpElementHandle === 'number' &&
    Object.keys(value).length === 1
  );
}

function isReplBindingMessage(value: unknown): value is ReplBindingMessage {
  return (
    isPlainRecord(value) &&
    typeof value.seq === 'number' &&
    (value.kind === 'tool' ||
      value.kind === 'getElement' ||
      value.kind === 'getEventListeners')
  );
}

function stripPageIdAndInnerParams(schema: ToolSchema): ToolSchema {
  const stripped: ToolSchema = {};
  for (const [key, fieldSchema] of Object.entries(schema)) {
    if (key === 'pageId' || STRIPPED_INNER_PARAMS.has(key)) {
      continue;
    }
    stripped[key] = fieldSchema;
  }
  return stripped;
}

function formatZodValidationError(
  toolName: string,
  error: zod.ZodError,
): string {
  const details = error.issues
    .map(
      issue =>
        `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
    )
    .join(', ');
  return `Invalid arguments for mcp.${toolName}: ${details}`;
}

function extractExceptionMessage(
  details: Protocol.Runtime.ExceptionDetails,
): string {
  const exception = details.exception;
  if (exception) {
    if (
      typeof exception.description === 'string' &&
      exception.description.length > 0
    ) {
      return exception.description;
    }
    const rawVal: unknown = exception.value;
    if (typeof rawVal === 'string' && rawVal.length > 0) {
      return rawVal;
    }
    if (rawVal !== undefined) {
      try {
        return JSON.stringify(rawVal);
      } catch {
        return String(rawVal);
      }
    }
  }
  return details.text || 'REPL evaluation failed.';
}

function isContextDestructionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Execution context was destroyed') ||
    message.includes('Cannot find context with specified id') ||
    message.includes('Inspected target navigated or closed') ||
    message.includes('Promise was collected') ||
    message.includes('Target closed') ||
    message.includes('Cannot find default execution context')
  );
}

async function resolveReplScriptSource(
  inlineSource: string | undefined,
  sourcePath: string | undefined,
  context: Context,
): Promise<string> {
  if (inlineSource !== undefined) {
    if (sourcePath !== undefined) {
      throw new Error('Specify exactly one of function or sourcePath.');
    }
    return inlineSource;
  }
  if (sourcePath === undefined) {
    throw new Error('Specify exactly one of function or sourcePath.');
  }

  let parsedUrl: URL | undefined;
  try {
    parsedUrl = new URL(sourcePath);
  } catch {
    parsedUrl = undefined;
  }
  if (
    parsedUrl &&
    ['http:', 'https:', 'ws:', 'wss:'].includes(parsedUrl.protocol)
  ) {
    throw new Error(
      'This parameter expects a file path, not a URL. Inline scripts must be passed via "function".',
    );
  }

  const validatedPath =
    parsedUrl?.protocol === 'file:'
      ? sourcePath
      : await context.validatePath(sourcePath);
  const resourceUrl = validatedPath.startsWith('file:')
    ? validatedPath
    : pathToFileURL(validatedPath).href;

  try {
    return await context.loadResource(resourceUrl);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to read script source from ${sourcePath}: ${errorMessage}`,
      {cause: error},
    );
  }
}

async function writeReplOutput(
  jsonText: string,
  response: Response,
  options: {context: Context; filePath?: string},
): Promise<void> {
  if (options.filePath) {
    const data = new TextEncoder().encode(jsonText);
    const {filename} = await options.context.saveFile(
      data,
      options.filePath,
      '.json',
    );
    response.appendResponseLine(
      `Script ran on page. Output saved to ${filename}.`,
    );
    return;
  }
  response.appendResponseLine('Script ran on page and returned:');
  response.appendResponseLine('```json');
  response.appendResponseLine(jsonText);
  response.appendResponseLine('```');
}

function buildBootstrapExpression(options: {
  bindingName: string;
  enabledToolNames: readonly string[];
  outerOnlyToolNames: readonly string[];
  disabledInnerToolNames: readonly string[];
  functionSource: string;
}): string {
  const {
    bindingName,
    enabledToolNames,
    outerOnlyToolNames,
    disabledInnerToolNames,
    functionSource,
  } = options;
  return `((
  $, $$, $x, getAccessibleName, getAccessibleRole, monitorEvents, unmonitorEvents, $0
) => {
  const JSON_parse = JSON.parse;
  const JSON_stringify = JSON.stringify;
  const MapCtor = Map;
  const PromiseCtor = Promise;
  const ErrorCtor = Error;
  const Reflect_get = Reflect.get;
  const Object_create = Object.create;
  const Object_entries = Object.entries;
  const Object_freeze = Object.freeze;
  const Array_isArray = Array.isArray;

  const rawBinding = globalThis[${JSON.stringify(bindingName)}];
  delete globalThis[${JSON.stringify(bindingName)}];

  const elementMap = new MapCtor();
  const pendingCalls = new MapCtor();
  let nextHandleId = 0;
  let nextSeq = 0;

  function encodeArgValue(value, allocatedIds) {
    if (typeof value === 'object' && value !== null) {
      if (Reflect_get(value, 'nodeType') === 1) {
        const id = ++nextHandleId;
        elementMap.set(id, value);
        allocatedIds.push(id);
        return { mcpElementHandle: id };
      }
      if (Array_isArray(value)) {
        const mapped = [];
        for (const item of value) {
          mapped.push(encodeArgValue(item, allocatedIds));
        }
        return mapped;
      }
      const out = Object_create(null);
      for (const [k, v] of Object_entries(value)) {
        out[k] = encodeArgValue(v, allocatedIds);
      }
      return out;
    }
    return value;
  }

  async function invokeHost(kind, name, rawParams) {
    if (typeof rawBinding !== 'function') {
      throw new ErrorCtor('REPL host binding is unavailable.');
    }
    const allocatedIds = [];
    const encodedParams = encodeArgValue(rawParams, allocatedIds);
    const seq = ++nextSeq;
    const resultPromise = new PromiseCtor((resolve, reject) => {
      pendingCalls.set(seq, { resolve, reject });
    });
    rawBinding(JSON_stringify({
      seq,
      kind,
      name,
      params: encodedParams,
    }));
    try {
      return await resultPromise;
    } finally {
      for (const id of allocatedIds) {
        elementMap.delete(id);
      }
    }
  }

  const mcp = Object_create(null);
  for (const toolName of ${JSON.stringify(enabledToolNames)}) {
    mcp[toolName] = (params) => invokeHost('tool', toolName, params === undefined ? {} : params);
  }
  mcp.getElement = (uid) => invokeHost('getElement', 'getElement', { uid });
  mcp.getEventListeners = (target) => invokeHost('getEventListeners', 'getEventListeners', target === undefined ? {} : target);

  for (const outerName of ${JSON.stringify(outerOnlyToolNames)}) {
    mcp[outerName] = async () => {
      throw new ErrorCtor(
        "Tool '" + outerName + "' is an outer MCP tool and cannot be called via mcp.* inside evaluate_script; return from evaluate_script and call '" + outerName + "' directly."
      );
    };
  }

  for (const disabledName of ${JSON.stringify(disabledInnerToolNames)}) {
    mcp[disabledName] = async () => {
      throw new ErrorCtor(
        "Tool '" + disabledName + "' is currently disabled on this server."
      );
    };
  }

  Object_freeze(mcp);

  const userFn = (
${functionSource}
  );
  if (typeof userFn !== 'function') {
    throw new ErrorCtor('REPL evaluate_script expects a function (e.g. async (mcp) => { ... }).');
  }

  return {
    getElementByHandleId(id) {
      return elementMap.get(id);
    },
    resolveCall(seq, resultJson) {
      const pending = pendingCalls.get(seq);
      if (pending) {
        pendingCalls.delete(seq);
        pending.resolve(JSON_parse(resultJson));
      }
    },
    resolveElementCall(seq, node) {
      const pending = pendingCalls.get(seq);
      if (pending) {
        pendingCalls.delete(seq);
        const isElement = typeof node === 'object' && node !== null && Reflect_get(node, 'nodeType') === 1;
        pending.resolve(isElement ? node : null);
      }
    },
    rejectCall(seq, errorMessage) {
      const pending = pendingCalls.get(seq);
      if (pending) {
        pendingCalls.delete(seq);
        pending.reject(new ErrorCtor(errorMessage));
      }
    },
    async run() {
      try {
        const result = await userFn(mcp);
        const serialized = JSON_stringify(result);
        return serialized === undefined ? 'undefined' : serialized;
      } catch (err) {
        if (
          err instanceof ErrorCtor ||
          (typeof err === 'object' &&
            err !== null &&
            'message' in err &&
            typeof Reflect_get(err, 'message') === 'string')
        ) {
          throw err;
        }
        let msg;
        try {
          msg = typeof err === 'object' && err !== null ? JSON_stringify(err) : String(err);
        } catch {
          msg = String(err);
        }
        throw new ErrorCtor(msg);
      }
    },
  };
})(
  typeof $ === 'function' ? $ : undefined,
  typeof $$ === 'function' ? $$ : undefined,
  typeof $x === 'function' ? $x : undefined,
  typeof getAccessibleName === 'function' ? getAccessibleName : undefined,
  typeof getAccessibleRole === 'function' ? getAccessibleRole : undefined,
  typeof monitorEvents === 'function' ? monitorEvents : undefined,
  typeof unmonitorEvents === 'function' ? unmonitorEvents : undefined,
  typeof $0 !== 'undefined' ? $0 : undefined,
)`;
}

/* eslint-disable @local/enforce-zod-schema -- strict runtime input validation for inner REPL tools. */
function buildStrictInnerSchema(
  schema: ToolSchema,
): zod.ZodObject<zod.ZodRawShape, zod.core.$strict> {
  return zod.object(stripPageIdAndInnerParams(schema)).strict();
}
/* eslint-enable @local/enforce-zod-schema */

class ReplToolDispatcher {
  readonly completedSteps: CompletedReplStep[] = [];

  #innerMutex = new Mutex();
  #inFlight?: Promise<void>;
  #aborted = false;
  #navigated = false;
  #imagesAttached = 0;
  #mcpPage: McpPage;
  #context: McpContext;
  #outerResponse: Response;
  #serverConfig: ReadonlyServerConfig;
  #session: CDPSession;
  #contextId: number;
  #objectGroup: string;
  #innerToolsByName: ReadonlyMap<string, AnyToolDefinition>;
  #schemasByName = new Map<
    string,
    zod.ZodObject<zod.ZodRawShape, zod.core.$strict>
  >();
  #outputSchemasByName = new Map<
    string,
    zod.ZodObject<zod.ZodRawShape, zod.core.$strict>
  >();

  constructor(options: {
    mcpPage: McpPage;
    context: McpContext;
    outerResponse: Response;
    serverConfig: ReadonlyServerConfig;
    session: CDPSession;
    contextId: number;
    objectGroup: string;
    innerToolsByName: ReadonlyMap<string, AnyToolDefinition>;
  }) {
    this.#mcpPage = options.mcpPage;
    this.#context = options.context;
    this.#outerResponse = options.outerResponse;
    this.#serverConfig = options.serverConfig;
    this.#session = options.session;
    this.#contextId = options.contextId;
    this.#objectGroup = options.objectGroup;
    this.#innerToolsByName = options.innerToolsByName;
  }

  markNavigated(): void {
    this.#navigated = true;
  }

  abort(): void {
    this.#aborted = true;
  }

  async drainInFlight(): Promise<void> {
    if (this.#inFlight) {
      await this.#inFlight.catch(() => undefined);
    }
  }

  async #runExclusively<T>(work: () => Promise<T>): Promise<T> {
    using mutexGuard = await this.#innerMutex.acquire();
    void mutexGuard;
    if (this.#aborted || this.#navigated) {
      throw new Error(
        'REPL script execution ended due to full-page navigation.',
      );
    }
    const resolvers = Promise.withResolvers<void>();
    this.#inFlight = resolvers.promise;
    try {
      return await work();
    } finally {
      resolvers.resolve();
      if (this.#inFlight === resolvers.promise) {
        this.#inFlight = undefined;
      }
    }
  }

  async #describeElementHandle(
    handleId: number,
    holderObjectId: string,
  ): Promise<{backendNodeId: number; frameId?: string}> {
    const callRes = await this.#session.send('Runtime.callFunctionOn', {
      objectId: holderObjectId,
      functionDeclaration:
        'function(id) { return this.getElementByHandleId(id); }',
      arguments: [{value: handleId}],
      returnByValue: false,
      objectGroup: this.#objectGroup,
    });
    const elementObjectId = callRes.result.objectId;
    if (!elementObjectId) {
      throw new Error(
        'Failed to resolve live DOM Element passed to mcp.* (handle expired or null).',
      );
    }
    try {
      const {node} = await this.#session.send('DOM.describeNode', {
        objectId: elementObjectId,
      });
      if (node.nodeType !== 1) {
        throw new Error(
          `Expected a DOM Element (nodeType 1), received nodeType ${node.nodeType}.`,
        );
      }
      return {
        backendNodeId: node.backendNodeId,
        frameId: node.frameId,
      };
    } finally {
      await this.#session
        .send('Runtime.releaseObject', {objectId: elementObjectId})
        .catch(() => undefined);
    }
  }

  async #normalizeNestedValue(
    value: unknown,
    holderObjectId: string,
    stack: DisposableStack,
  ): Promise<unknown> {
    if (isElementHandleToken(value)) {
      const resolved = await this.#describeElementHandle(
        value.mcpElementHandle,
        holderObjectId,
      );
      const reg = this.#mcpPage.registerEphemeralBackendNode(resolved);
      stack.use(reg);
      return {uid: reg.uid};
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      for (const entry of value) {
        items.push(
          await this.#normalizeNestedValue(entry, holderObjectId, stack),
        );
      }
      return items;
    }
    if (isPlainRecord(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = await this.#normalizeNestedValue(v, holderObjectId, stack);
      }
      return out;
    }
    return value;
  }

  async #normalizeToolParams(
    toolName: string,
    rawParams: unknown,
    holderObjectId: string,
    stack: DisposableStack,
  ): Promise<Record<string, unknown>> {
    if (rawParams === undefined) {
      return {};
    }
    if (!isPlainRecord(rawParams)) {
      throw new Error(
        `Invalid arguments for mcp.${toolName}: expected an options object.`,
      );
    }

    for (const key of Object.keys(rawParams)) {
      if (STRIPPED_INNER_PARAMS.has(key)) {
        throw new Error(
          `Parameter "${key}" is disabled on inner mcp.${toolName} calls to prevent host-disk writes; omit "${key}" to receive inline output.`,
        );
      }
    }

    const paramsCopy: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawParams)) {
      if (key === 'pageId') {
        continue;
      }
      paramsCopy[key] = val;
    }

    const resolveSingleElementProp = async (
      sourceKey: string,
      targetKey: string,
    ): Promise<void> => {
      if (!(sourceKey in paramsCopy)) {
        return;
      }
      const propVal = paramsCopy[sourceKey];
      delete paramsCopy[sourceKey];
      if (propVal === undefined) {
        return;
      }
      if (!isElementHandleToken(propVal)) {
        throw new Error(
          `Invalid "${sourceKey}" passed to mcp.${toolName}: expected a live DOM Element, got ${propVal === null ? 'null' : typeof propVal}.`,
        );
      }
      if (paramsCopy[targetKey] !== undefined) {
        throw new Error(
          `Specify either "${targetKey}" or "${sourceKey}" on mcp.${toolName}, not both.`,
        );
      }
      const resolved = await this.#describeElementHandle(
        propVal.mcpElementHandle,
        holderObjectId,
      );
      const reg = this.#mcpPage.registerEphemeralBackendNode(resolved);
      stack.use(reg);
      paramsCopy[targetKey] = reg.uid;
    };

    await resolveSingleElementProp('element', 'uid');
    await resolveSingleElementProp('fromElement', 'from_uid');
    await resolveSingleElementProp('from_element', 'from_uid');
    await resolveSingleElementProp('toElement', 'to_uid');
    await resolveSingleElementProp('to_element', 'to_uid');

    if (toolName === 'fill_form' && Array.isArray(paramsCopy.elements)) {
      const normalizedElements: unknown[] = [];
      for (const item of paramsCopy.elements) {
        if (!isPlainRecord(item)) {
          normalizedElements.push(item);
          continue;
        }
        const entryCopy: Record<string, unknown> = {...item};
        if ('element' in entryCopy && entryCopy.element !== undefined) {
          const elToken = entryCopy.element;
          delete entryCopy.element;
          if (!isElementHandleToken(elToken)) {
            throw new Error(
              `Invalid "element" in mcp.fill_form elements: expected a live DOM Element.`,
            );
          }
          if (entryCopy.uid !== undefined) {
            throw new Error(
              'Specify either "uid" or "element" in mcp.fill_form elements, not both.',
            );
          }
          const resolved = await this.#describeElementHandle(
            elToken.mcpElementHandle,
            holderObjectId,
          );
          const reg = this.#mcpPage.registerEphemeralBackendNode(resolved);
          stack.use(reg);
          entryCopy.uid = reg.uid;
        }
        normalizedElements.push(entryCopy);
      }
      paramsCopy.elements = normalizedElements;
    }

    const finalParams: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(paramsCopy)) {
      finalParams[key] = await this.#normalizeNestedValue(
        val,
        holderObjectId,
        stack,
      );
    }
    return finalParams;
  }

  async invokeTool(
    toolName: string,
    rawParams: unknown,
    holderObjectId: string,
  ): Promise<Record<string, unknown>> {
    return await this.#runExclusively(async () => {
      const innerTool = this.#innerToolsByName.get(toolName);
      if (!innerTool) {
        throw new Error(`Unknown inner REPL tool: ${toolName}`);
      }

      using ephemeralStack = new DisposableStack();
      const normalizedParams = await this.#normalizeToolParams(
        toolName,
        rawParams,
        holderObjectId,
        ephemeralStack,
      );

      let strictSchema = this.#schemasByName.get(toolName);
      if (!strictSchema) {
        strictSchema = buildStrictInnerSchema(innerTool.schema);
        this.#schemasByName.set(toolName, strictSchema);
      }

      const parseResult = strictSchema.safeParse(normalizedParams);
      if (!parseResult.success) {
        throw new Error(formatZodValidationError(toolName, parseResult.error));
      }
      const parsedParams = parseResult.data;

      const innerResponse = new McpResponse(this.#serverConfig);
      innerResponse.setPage(this.#mcpPage);

      if (isPageScopedTool(innerTool)) {
        await innerTool.handler(
          {params: parsedParams, page: this.#mcpPage},
          innerResponse,
          this.#context,
        );
      } else if (isBrowserlessTool(innerTool)) {
        await innerTool.handler(
          {params: parsedParams},
          innerResponse,
          this.#context,
        );
      } else {
        await innerTool.handler(
          {params: parsedParams},
          innerResponse,
          this.#context,
        );
      }

      const {structuredContent} = await innerResponse.handle(
        this.#context,
        'default',
      );
      if (innerResponse.error) {
        throw innerResponse.error;
      }

      for (const image of innerResponse.images) {
        if (this.#imagesAttached >= MAX_REPL_IMAGES) {
          throw new Error(
            `Exceeded maximum of ${MAX_REPL_IMAGES} inline screenshots in a single evaluate_script call.`,
          );
        }
        this.#imagesAttached++;
        this.#outerResponse.attachImage(image);
      }

      const structuredRecord: Record<string, unknown> = {ok: true};
      for (const [k, v] of Object.entries(structuredContent)) {
        structuredRecord[k] = v;
      }

      if (innerTool.outputSchema) {
        let strictOutputSchema = this.#outputSchemasByName.get(toolName);
        if (!strictOutputSchema) {
          strictOutputSchema = buildStrictRuntimeOutputSchema(
            innerTool.outputSchema,
          );
          this.#outputSchemasByName.set(toolName, strictOutputSchema);
        }
        const outParse = strictOutputSchema.safeParse(structuredRecord);
        if (!outParse.success) {
          throw new Error(
            formatZodOutputValidationError(`mcp.${toolName}`, outParse.error),
          );
        }
      }

      const navigatedToUrl =
        typeof structuredRecord.navigatedToUrl === 'string'
          ? structuredRecord.navigatedToUrl
          : undefined;
      this.completedSteps.push({
        tool: toolName,
        ok: true,
        ...(navigatedToUrl !== undefined ? {navigatedToUrl} : {}),
      });

      return structuredRecord;
    });
  }

  async resolveElementRemoteObjectId(uid: unknown): Promise<string | null> {
    return await this.#runExclusively(async () => {
      if (typeof uid !== 'string' || uid.length === 0) {
        throw new Error('mcp.getElement(uid) requires a non-empty uid string.');
      }
      const resolved = await this.#mcpPage.resolveUidToBackendNodeId(uid);
      if (!resolved) {
        return null;
      }
      try {
        const {object} = await this.#session.send('DOM.resolveNode', {
          backendNodeId: resolved.backendNodeId,
          executionContextId: this.#contextId,
        });
        return object.objectId ?? null;
      } catch {
        // Cross-origin OOPIF or detached node cannot be resolved into main-frame world.
        return null;
      }
    });
  }

  async getEventListeners(
    rawTarget: unknown,
    holderObjectId: string,
  ): Promise<
    Array<{
      type: string;
      useCapture: boolean;
      passive: boolean;
      once: boolean;
      lineNumber: number;
      columnNumber: number;
    }>
  > {
    return await this.#runExclusively(async () => {
      if (!isPlainRecord(rawTarget)) {
        throw new Error(
          'mcp.getEventListeners requires { element } or { uid }.',
        );
      }

      let backendNodeId: number | undefined;
      if ('element' in rawTarget && rawTarget.element !== undefined) {
        if (!isElementHandleToken(rawTarget.element)) {
          throw new Error(
            'Invalid "element" passed to mcp.getEventListeners: expected a live DOM Element.',
          );
        }
        const desc = await this.#describeElementHandle(
          rawTarget.element.mcpElementHandle,
          holderObjectId,
        );
        backendNodeId = desc.backendNodeId;
      } else if (
        typeof rawTarget.uid === 'string' &&
        rawTarget.uid.length > 0
      ) {
        const resolved = await this.#mcpPage.resolveUidToBackendNodeId(
          rawTarget.uid,
        );
        if (!resolved) {
          throw new Error(
            `Element uid "${rawTarget.uid}" not found on page ${this.#mcpPage.id}.`,
          );
        }
        backendNodeId = resolved.backendNodeId;
      } else {
        throw new Error(
          'mcp.getEventListeners requires either { element } or { uid }.',
        );
      }

      const {object} = await this.#session.send('DOM.resolveNode', {
        backendNodeId,
      });
      if (!object.objectId) {
        return [];
      }
      try {
        const {listeners} = await this.#session.send(
          'DOMDebugger.getEventListeners',
          {
            objectId: object.objectId,
          },
        );
        return listeners.map(listener => ({
          type: listener.type,
          useCapture: listener.useCapture,
          passive: listener.passive,
          once: listener.once,
          lineNumber: listener.lineNumber,
          columnNumber: listener.columnNumber,
        }));
      } finally {
        await this.#session
          .send('Runtime.releaseObject', {objectId: object.objectId})
          .catch(() => undefined);
      }
    });
  }
}

export function createReplEvaluateTool(
  cliArgs: ParsedArguments,
  innerTools: readonly AnyToolDefinition[],
  allTools: readonly AnyToolDefinition[],
): AnyToolDefinition | undefined {
  if (!Array.isArray(innerTools) || !Array.isArray(allTools)) {
    return undefined;
  }

  const innerToolsByName = new Map<string, AnyToolDefinition>();
  for (const tool of innerTools) {
    innerToolsByName.set(tool.name, tool);
  }

  const enabledToolNames = [...innerToolsByName.keys()];
  const disabledInnerToolNames: string[] = [];
  for (const name of INNER_REPL_TOOL_NAMES) {
    if (!innerToolsByName.has(name)) {
      disabledInnerToolNames.push(name);
    }
  }

  const outerOnlyToolNames: string[] = [];
  for (const tool of allTools) {
    if (
      tool.name === 'evaluate_script' ||
      tool.name === 'wait_for' ||
      isSlimTool(tool) ||
      INNER_REPL_TOOL_NAMES.has(tool.name)
    ) {
      continue;
    }
    outerOnlyToolNames.push(tool.name);
  }

  const apiDeclaration = buildReplApiDeclaration(innerTools);
  const serverConfig = new ServerConfig({
    cliArgs: {},
    fileArgs: {},
    configPath: cliArgs.config,
    resolved: cliArgs,
  });

  const factory = definePageTool(() => ({
    name: 'evaluate_script',
    description: `Evaluate an async JavaScript function \`async (mcp: McpTools) => { ... }\` inside the page REPL context. Returns JSON.\n\`\`\`ts\n${apiDeclaration}\n\`\`\``,
    annotations: {
      category: ToolCategory.DEBUGGING,
      readOnlyHint: false,
      conditions: ['javascriptEvaluation', 'repl'],
    },
    schema: {
      function: zod
        .string()
        .optional()
        .describe(
          'Async function `(mcp) => ...` to execute in the REPL context. Provide either function or sourcePath, not both.',
        ),
      sourcePath: zod
        .string()
        .optional()
        .describe(
          "Path to a local JavaScript file on the MCP server's filesystem exporting/containing `(mcp) => ...`. URLs are not allowed.",
        ),
      filePath: zod
        .string()
        .optional()
        .describe(
          'Optional local file path to write the JSON return value to instead of returning inline.',
        ),
      dialogAction: zod
        .string()
        .optional()
        .describe(
          'How to handle modal dialogs opened during execution: "accept" (default), "dismiss", or prompt response string.',
        ),
      waitForStableDom: zod
        .boolean()
        .optional()
        .describe(
          'Whether to wait for DOM stability on navigation/mutations. Defaults to true.',
        ),
    },
    blockedByDialog: true,
    concurrency: 'exclusive',
    verifyFilesSchema: {
      filePath: true,
      sourcePath: {local: true, remote: true},
    },
    handler: async (request, response, context) => {
      if (!(request.page instanceof McpPage)) {
        throw new Error('REPL evaluate_script requires an McpPage instance.');
      }
      if (!(context instanceof McpContext)) {
        throw new Error(
          'REPL evaluate_script requires an McpContext instance.',
        );
      }

      const mcpPage = request.page;
      mcpPage.throwIfDialogOpen();

      const rawSource = await resolveReplScriptSource(
        request.params.function,
        request.params.sourcePath,
        context,
      );
      const functionSource = rawSource.trimEnd().replace(/;$/, '');

      const {
        session,
        contextId,
        loaderId: initialLoaderId,
      } = await mcpPage.getReplExecutionContext({
        mainWorld: cliArgs.replMainWorld,
      });

      const turnId = crypto.randomUUID().replaceAll('-', '');
      const bindingName = `__mcpCallTool_${turnId}`;
      const objectGroup = `cd4a_repl_turn_${turnId}`;

      const dispatcher = new ReplToolDispatcher({
        mcpPage,
        context,
        outerResponse: response,
        serverConfig,
        session,
        contextId,
        objectGroup,
        innerToolsByName,
      });

      let mainFrameCrossDocNavigated = false;
      const onFrameNavigated = (
        event: Protocol.Page.FrameNavigatedEvent,
      ): void => {
        if (!event.frame.parentId) {
          mainFrameCrossDocNavigated = true;
          dispatcher.markNavigated();
        }
      };

      const checkCrossDocumentNavigated = async (): Promise<boolean> => {
        if (mainFrameCrossDocNavigated) {
          return true;
        }
        try {
          const {frameTree} = await session.send('Page.getFrameTree');
          if (frameTree.frame.loaderId !== initialLoaderId) {
            mainFrameCrossDocNavigated = true;
            dispatcher.markNavigated();
            return true;
          }
        } catch {
          // Ignore session errors if target closed.
        }
        return mainFrameCrossDocNavigated;
      };

      let holderObjectId = '';
      const onBindingCalled = (
        event: Protocol.Runtime.BindingCalledEvent,
      ): void => {
        if (
          event.name !== bindingName ||
          event.executionContextId !== contextId ||
          !holderObjectId
        ) {
          return;
        }
        void (async () => {
          let parsedPayload: unknown;
          try {
            parsedPayload = JSON.parse(event.payload);
          } catch {
            return;
          }
          if (!isReplBindingMessage(parsedPayload)) {
            return;
          }
          const {seq, kind, name, params} = parsedPayload;
          try {
            if (kind === 'getElement') {
              const uidVal = isPlainRecord(params) ? params.uid : undefined;
              const elementObjId =
                await dispatcher.resolveElementRemoteObjectId(uidVal);
              if (elementObjId) {
                try {
                  await session.send('Runtime.callFunctionOn', {
                    objectId: holderObjectId,
                    functionDeclaration:
                      'function(seq, node) { this.resolveElementCall(seq, node); }',
                    arguments: [{value: seq}, {objectId: elementObjId}],
                    returnByValue: true,
                  });
                } finally {
                  await session
                    .send('Runtime.releaseObject', {objectId: elementObjId})
                    .catch(() => undefined);
                }
              } else {
                await session.send('Runtime.callFunctionOn', {
                  objectId: holderObjectId,
                  functionDeclaration:
                    'function(seq, node) { this.resolveElementCall(seq, node); }',
                  arguments: [{value: seq}, {value: null}],
                  returnByValue: true,
                });
              }
              return;
            }

            if (kind === 'getEventListeners') {
              const listeners = await dispatcher.getEventListeners(
                params,
                holderObjectId,
              );
              await session.send('Runtime.callFunctionOn', {
                objectId: holderObjectId,
                functionDeclaration:
                  'function(seq, json) { this.resolveCall(seq, json); }',
                arguments: [{value: seq}, {value: JSON.stringify(listeners)}],
                returnByValue: true,
              });
              return;
            }

            const result = await dispatcher.invokeTool(
              name ?? '',
              params,
              holderObjectId,
            );
            await session.send('Runtime.callFunctionOn', {
              objectId: holderObjectId,
              functionDeclaration:
                'function(seq, json) { this.resolveCall(seq, json); }',
              arguments: [{value: seq}, {value: JSON.stringify(result)}],
              returnByValue: true,
            });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            await session
              .send('Runtime.callFunctionOn', {
                objectId: holderObjectId,
                functionDeclaration:
                  'function(seq, msg) { this.rejectCall(seq, msg); }',
                arguments: [{value: seq}, {value: msg}],
                returnByValue: true,
              })
              .catch(() => undefined);
          }
        })();
      };

      session.on('Page.frameNavigated', onFrameNavigated);
      session.on('Runtime.bindingCalled', onBindingCalled);
      mcpPage.setReplDialogAction(request.params.dialogAction ?? 'accept');

      try {
        await session.send('Runtime.addBinding', {
          name: bindingName,
          executionContextId: contextId,
        });

        const bootstrapExpression = buildBootstrapExpression({
          bindingName,
          enabledToolNames,
          outerOnlyToolNames,
          disabledInnerToolNames,
          functionSource,
        });

        const bootstrapRes = await session.send('Runtime.evaluate', {
          expression: bootstrapExpression,
          contextId,
          includeCommandLineAPI: true,
          objectGroup,
          returnByValue: false,
          awaitPromise: false,
        });

        if (bootstrapRes.exceptionDetails) {
          throw new Error(
            extractExceptionMessage(bootstrapRes.exceptionDetails),
          );
        }
        if (!bootstrapRes.result.objectId) {
          throw new Error('Failed to initialize REPL execution harness.');
        }
        holderObjectId = bootstrapRes.result.objectId;

        let serializedOutput: string;
        try {
          const runRes = await session.send('Runtime.callFunctionOn', {
            objectId: holderObjectId,
            functionDeclaration: 'function() { return this.run(); }',
            awaitPromise: true,
            returnByValue: true,
          });

          if (runRes.exceptionDetails) {
            await dispatcher.drainInFlight();
            dispatcher.abort();
            if (await checkCrossDocumentNavigated()) {
              if (
                request.params.waitForStableDom !== false &&
                dispatcher.completedSteps.every(s => !s.navigatedToUrl)
              ) {
                await mcpPage
                  .createWaitForHelper(
                    mcpPage.cpuThrottlingRate,
                    getNetworkMultiplierFromString(mcpPage.networkConditions),
                  )
                  .waitForStableDom()
                  .catch(() => undefined);
              }
              const earlyExitJson = JSON.stringify({
                navigated: true,
                newUrl: mcpPage.pptrPage.url(),
                completedSteps: dispatcher.completedSteps,
                note: 'Script ended early due to full-page navigation; call evaluate_script again on the new page.',
              });
              await writeReplOutput(earlyExitJson, response, {
                context,
                filePath: request.params.filePath,
              });
              return;
            }
            throw new Error(extractExceptionMessage(runRes.exceptionDetails));
          }

          const rawValue: unknown = runRes.result.value;
          serializedOutput =
            typeof rawValue === 'string' ? rawValue : 'undefined';
        } catch (error) {
          await dispatcher.drainInFlight();
          dispatcher.abort();
          if (
            isContextDestructionError(error) &&
            (await checkCrossDocumentNavigated())
          ) {
            if (
              request.params.waitForStableDom !== false &&
              dispatcher.completedSteps.every(s => !s.navigatedToUrl)
            ) {
              await mcpPage
                .createWaitForHelper(
                  mcpPage.cpuThrottlingRate,
                  getNetworkMultiplierFromString(mcpPage.networkConditions),
                )
                .waitForStableDom()
                .catch(() => undefined);
            }
            const earlyExitJson = JSON.stringify({
              navigated: true,
              newUrl: mcpPage.pptrPage.url(),
              completedSteps: dispatcher.completedSteps,
              note: 'Script ended early due to full-page navigation; call evaluate_script again on the new page.',
            });
            await writeReplOutput(earlyExitJson, response, {
              context,
              filePath: request.params.filePath,
            });
            return;
          }
          throw error;
        }

        if (request.params.waitForStableDom === true) {
          await mcpPage
            .createWaitForHelper(
              mcpPage.cpuThrottlingRate,
              getNetworkMultiplierFromString(mcpPage.networkConditions),
            )
            .waitForStableDom()
            .catch(() => undefined);
        }

        await writeReplOutput(serializedOutput, response, {
          context,
          filePath: request.params.filePath,
        });
      } finally {
        dispatcher.abort();
        mcpPage.setReplDialogAction(undefined);
        session.off('Runtime.bindingCalled', onBindingCalled);
        session.off('Page.frameNavigated', onFrameNavigated);
        await session
          .send('Runtime.removeBinding', {name: bindingName})
          .catch(() => undefined);
        await session
          .send('Runtime.releaseObjectGroup', {objectGroup})
          .catch(() => undefined);
      }
    },
  }));

  return factory(cliArgs);
}
