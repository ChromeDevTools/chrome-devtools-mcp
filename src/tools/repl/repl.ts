/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

import type {ParsedArguments} from '../../config/mcp-options.js';
import {
  DisposableStack,
  Mutex,
  zod,
  type CDPSession,
  type Protocol,
} from '../../third_party/index.js';
import {isPlainRecord} from '../../utils/objects.js';
import {getNetworkMultiplierFromString} from '../../utils/WaitForHelper.js';

import {ToolCategory} from '../categories.js';
import {
  definePageTool,
  isSlimTool,
  type AnyToolDefinition,
  type Context,
  type ContextPage,
  type DefinedPageTool,
  type DomEventListenerSummary,
  type Response,
  type ToolSchema,
} from '../ToolDefinition.js';
import {
  INNER_REPL_TOOL_NAMES,
  STRIPPED_INNER_PARAMS,
  stripReplToolParams,
} from './replPartition.js';
import {
  buildReplApiDeclaration,
  buildStrictRuntimeOutputSchema,
  formatZodOutputValidationError,
} from './replSchema.js';

const MAX_REPL_IMAGES = 4;
const MAX_REPL_WAIT_TIMEOUT_MS = 30_000;
const MAX_PENDING_BINDING_CALLS = 32;
const MAX_BINDING_PAYLOAD_BYTES = 1_048_576;
const MAX_ARG_NESTING_DEPTH = 64;
const FORBIDDEN_PARAM_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

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

function isElementHandleToken(
  value: unknown,
): value is {mcpElementHandle: number} {
  return (
    isPlainRecord(value) &&
    Object.hasOwn(value, 'mcpElementHandle') &&
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

function stripTrailingSemicolonsAndComments(source: string): string {
  let i = 0;
  let lastSignificantEnd = 0;
  const templateBraceDepths: number[] = [];

  const scanTemplateTail = (): void => {
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        i++;
        lastSignificantEnd = i;
        return;
      }
      if (ch === '$' && source[i + 1] === '{') {
        i += 2;
        templateBraceDepths.push(0);
        lastSignificantEnd = i;
        return;
      }
      i++;
    }
    lastSignificantEnd = source.length;
  };

  while (i < source.length) {
    const ch = source[i];
    if (
      ch === ' ' ||
      ch === '\t' ||
      ch === '\n' ||
      ch === '\r' ||
      ch === '\f' ||
      ch === '\v' ||
      ch === ';'
    ) {
      i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') {
        i++;
      }
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const closeIdx = source.indexOf('*/', i + 2);
      if (closeIdx === -1) {
        lastSignificantEnd = source.length;
        break;
      }
      i = closeIdx + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      lastSignificantEnd = i;
      continue;
    }
    if (ch === '`') {
      i++;
      scanTemplateTail();
      continue;
    }
    if (templateBraceDepths.length > 0) {
      const topIdx = templateBraceDepths.length - 1;
      const currentDepth = templateBraceDepths[topIdx] ?? 0;
      if (ch === '{') {
        templateBraceDepths[topIdx] = currentDepth + 1;
      } else if (ch === '}') {
        if (currentDepth === 0) {
          templateBraceDepths.pop();
          i++;
          lastSignificantEnd = i;
          scanTemplateTail();
          continue;
        }
        templateBraceDepths[topIdx] = currentDepth - 1;
      }
    }
    i++;
    lastSignificantEnd = i;
  }

  return lastSignificantEnd > 0
    ? source.slice(0, lastSignificantEnd)
    : source.trim();
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
  const protocol = parsedUrl?.protocol.toLowerCase();
  if (parsedUrl && protocol !== 'file:' && !/^[a-z]:$/.test(protocol ?? '')) {
    throw new Error(
      'This parameter expects a local file path, not a URL. Inline scripts must be passed via "function".',
    );
  }
  if (
    parsedUrl &&
    protocol === 'file:' &&
    parsedUrl.hostname !== '' &&
    parsedUrl.hostname.toLowerCase() !== 'localhost'
  ) {
    throw new Error(
      'This parameter expects a local file path, not a URL. Inline scripts must be passed via "function".',
    );
  }

  let localCandidatePath = sourcePath;
  if (parsedUrl && protocol === 'file:') {
    try {
      localCandidatePath = fileURLToPath(parsedUrl);
    } catch {
      throw new Error(
        'This parameter expects a local file path, not a URL. Inline scripts must be passed via "function".',
      );
    }
  }

  const validatedPath = await context.validatePath(localCandidatePath);
  const resourceUrl = pathToFileURL(validatedPath).href;

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

function buildUserFunctionExpression(functionSource: string): string {
  return `((
  $, $$, $x, getAccessibleName, getAccessibleRole, monitorEvents, unmonitorEvents, $0
) => (
${functionSource}
))(
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

function buildBootstrapExpression(options: {
  bindingName: string;
  enabledToolNames: readonly string[];
  outerOnlyToolNames: readonly string[];
  disabledInnerToolNames: readonly string[];
}): string {
  const {
    bindingName,
    enabledToolNames,
    outerOnlyToolNames,
    disabledInnerToolNames,
  } = options;
  return `(() => {
  const JSON_parse = JSON.parse;
  const JSON_stringify = JSON.stringify;
  const MapCtor = Map;
  const Map_get = Map.prototype.get;
  const Map_set = Map.prototype.set;
  const Map_delete = Map.prototype.delete;
  const SetCtor = Set;
  const Set_has = Set.prototype.has;
  const Set_add = Set.prototype.add;
  const Set_delete = Set.prototype.delete;
  const Function_call = Function.prototype.call;
  const PromiseCtor = Promise;
  const ErrorCtor = Error;
  const TypeErrorCtor = TypeError;
  const Reflect_get = Reflect.get;
  const Object_create = Object.create;
  const Object_keys = Object.keys;
  const Object_defineProperty = Object.defineProperty;
  const Object_getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const Object_freeze = Object.freeze;
  const Array_isArray = Array.isArray;
  const Array_push = Array.prototype.push;
  const Node_nodeType_get =
    typeof Node === 'function'
      ? Object_getOwnPropertyDescriptor(Node.prototype, 'nodeType')?.get
      : undefined;

  const rawBinding = globalThis[${JSON.stringify(bindingName)}];
  delete globalThis[${JSON.stringify(bindingName)}];

  const elementMap = new MapCtor();
  const pendingCalls = new MapCtor();
  let nextHandleId = 0;
  let nextSeq = 0;

  function isDomElement(val) {
    if ((typeof val !== 'object' && typeof val !== 'function') || val === null) {
      return false;
    }
    if (typeof Node_nodeType_get === 'function') {
      try {
        return Function_call.call(Node_nodeType_get, val) === 1;
      } catch {
        return false;
      }
    }
    return false;
  }

  function setDataProp(target, key, val) {
    Object_defineProperty(target, key, {
      value: val,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  function encodeArgValue(value, allocatedIds, seen, depth) {
    if (depth > ${MAX_ARG_NESTING_DEPTH}) {
      throw new TypeErrorCtor('Maximum argument nesting depth exceeded in mcp.* call.');
    }
    if (isDomElement(value)) {
      const id = ++nextHandleId;
      Function_call.call(Map_set, elementMap, id, value);
      Function_call.call(Array_push, allocatedIds, id);
      const token = Object_create(null);
      setDataProp(token, 'mcpElementHandle', id);
      return token;
    }
    if (typeof value === 'object' && value !== null) {
      if (Function_call.call(Set_has, seen, value)) {
        throw new TypeErrorCtor('Circular reference in mcp.* arguments.');
      }
      Function_call.call(Set_add, seen, value);
      try {
        if (Array_isArray(value)) {
          const mapped = [];
          for (let i = 0; i < value.length; i++) {
            Function_call.call(
              Array_push,
              mapped,
              encodeArgValue(value[i], allocatedIds, seen, depth + 1),
            );
          }
          return mapped;
        }
        const out = Object_create(null);
        const keys = Object_keys(value);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
            throw new TypeErrorCtor('Forbidden property key "' + k + '" in mcp.* arguments.');
          }
          setDataProp(
            out,
            k,
            encodeArgValue(value[k], allocatedIds, seen, depth + 1),
          );
        }
        return out;
      } finally {
        Function_call.call(Set_delete, seen, value);
      }
    }
    return value;
  }

  async function invokeHost(kind, name, rawParams) {
    if (typeof rawBinding !== 'function') {
      throw new ErrorCtor('REPL host binding is unavailable.');
    }
    const allocatedIds = [];
    let seq = 0;
    try {
      const seen = new SetCtor();
      const encodedParams = encodeArgValue(rawParams, allocatedIds, seen, 0);
      seq = ++nextSeq;
      const resultPromise = new PromiseCtor((resolve, reject) => {
        const entry = Object_create(null);
        setDataProp(entry, 'resolve', resolve);
        setDataProp(entry, 'reject', reject);
        Function_call.call(Map_set, pendingCalls, seq, entry);
      });
      const msg = Object_create(null);
      setDataProp(msg, 'seq', seq);
      setDataProp(msg, 'kind', kind);
      setDataProp(msg, 'name', name);
      setDataProp(msg, 'params', encodedParams);
      rawBinding(JSON_stringify(msg));
      return await resultPromise;
    } finally {
      if (seq !== 0) {
        Function_call.call(Map_delete, pendingCalls, seq);
      }
      for (let i = 0; i < allocatedIds.length; i++) {
        Function_call.call(Map_delete, elementMap, allocatedIds[i]);
      }
    }
  }

  const mcp = Object_create(null);
  for (const toolName of ${JSON.stringify(enabledToolNames)}) {
    setDataProp(
      mcp,
      toolName,
      (params) => invokeHost('tool', toolName, params === undefined ? Object_create(null) : params),
    );
  }
  setDataProp(mcp, 'getElement', (uid) => {
    const arg = Object_create(null);
    setDataProp(arg, 'uid', uid);
    return invokeHost('getElement', 'getElement', arg);
  });
  setDataProp(
    mcp,
    'getEventListeners',
    (target) => invokeHost('getEventListeners', 'getEventListeners', target === undefined ? Object_create(null) : target),
  );

  for (const outerName of ${JSON.stringify(outerOnlyToolNames)}) {
    setDataProp(mcp, outerName, async () => {
      throw new ErrorCtor(
        "Tool '" + outerName + "' is an outer MCP tool and cannot be called via mcp.* inside evaluate_script; return from evaluate_script and call '" + outerName + "' directly."
      );
    });
  }

  for (const disabledName of ${JSON.stringify(disabledInnerToolNames)}) {
    setDataProp(mcp, disabledName, async () => {
      throw new ErrorCtor(
        "Tool '" + disabledName + "' is currently disabled on this server."
      );
    });
  }

  Object_freeze(mcp);

  const harness = Object_create(null);
  setDataProp(harness, 'getElementByHandleId', function(id) {
    return Function_call.call(Map_get, elementMap, id);
  });
  setDataProp(harness, 'resolveCall', function(seq, resultJson) {
    const pending = Function_call.call(Map_get, pendingCalls, seq);
    if (pending) {
      Function_call.call(Map_delete, pendingCalls, seq);
      pending.resolve(JSON_parse(resultJson));
    }
  });
  setDataProp(harness, 'resolveElementCall', function(seq, node) {
    const pending = Function_call.call(Map_get, pendingCalls, seq);
    if (pending) {
      Function_call.call(Map_delete, pendingCalls, seq);
      pending.resolve(isDomElement(node) ? node : null);
    }
  });
  setDataProp(harness, 'rejectCall', function(seq, errorMessage) {
    const pending = Function_call.call(Map_get, pendingCalls, seq);
    if (pending) {
      Function_call.call(Map_delete, pendingCalls, seq);
      pending.reject(new ErrorCtor(errorMessage));
    }
  });
  setDataProp(harness, 'run', async function(userFn) {
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
  });
  return harness;
})()`;
}

/* eslint-disable @local/enforce-zod-schema -- strict runtime input validation for inner REPL tools. */
function buildStrictInnerSchema(
  schema: ToolSchema,
): zod.ZodObject<zod.ZodRawShape, zod.core.$strict> {
  return zod.object(stripReplToolParams(schema, {stripPageId: true})).strict();
}
/* eslint-enable @local/enforce-zod-schema */

function setOwnProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

class ReplToolDispatcher {
  readonly completedSteps: CompletedReplStep[] = [];

  #innerMutex = new Mutex();
  #inFlight?: Promise<void>;
  #aborted = false;
  #navigated = false;
  #imagesAttached = 0;
  #page: ContextPage;
  #context: Context;
  #outerResponse: Response;
  #session: CDPSession;
  #contextId: number;
  #objectGroup: string;
  #mainWorld: boolean;
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
    page: ContextPage;
    context: Context;
    outerResponse: Response;
    session: CDPSession;
    contextId: number;
    objectGroup: string;
    mainWorld: boolean;
    innerToolsByName: ReadonlyMap<string, AnyToolDefinition>;
  }) {
    this.#page = options.page;
    this.#context = options.context;
    this.#outerResponse = options.outerResponse;
    this.#session = options.session;
    this.#contextId = options.contextId;
    this.#objectGroup = options.objectGroup;
    this.#mainWorld = options.mainWorld;
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
    using guard = await this.#innerMutex.acquire();
    void guard;
  }

  async #runExclusively<T>(work: () => Promise<T>): Promise<T> {
    using mutexGuard = await this.#innerMutex.acquire();
    void mutexGuard;
    if (this.#navigated) {
      throw new Error(
        'REPL script execution ended due to full-page navigation.',
      );
    }
    if (this.#aborted) {
      throw new Error('REPL script execution has already ended.');
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
  ): Promise<{backendNodeId: number; frameId?: string; role?: string}> {
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
        role: node.nodeName.toUpperCase() === 'OPTION' ? 'option' : undefined,
      };
    } finally {
      await this.#session
        .send('Runtime.releaseObject', {objectId: elementObjectId})
        .catch(() => undefined);
    }
  }

  async #normalizeNestedValue(
    toolName: string,
    value: unknown,
    holderObjectId: string,
    stack: DisposableStack,
    depth: number,
  ): Promise<unknown> {
    if (depth > MAX_ARG_NESTING_DEPTH) {
      throw new Error(
        `Invalid arguments for mcp.${toolName}: maximum nesting depth exceeded.`,
      );
    }
    if (isElementHandleToken(value)) {
      const resolved = await this.#describeElementHandle(
        value.mcpElementHandle,
        holderObjectId,
      );
      const reg = this.#page.registerEphemeralBackendNode(resolved);
      stack.use(reg);
      return {uid: reg.uid};
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      for (const entry of value) {
        items.push(
          await this.#normalizeNestedValue(
            toolName,
            entry,
            holderObjectId,
            stack,
            depth + 1,
          ),
        );
      }
      return items;
    }
    if (isPlainRecord(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (FORBIDDEN_PARAM_KEYS.has(k)) {
          throw new Error(
            `Invalid arguments for mcp.${toolName}: forbidden key "${k}".`,
          );
        }
        setOwnProperty(
          out,
          k,
          await this.#normalizeNestedValue(
            toolName,
            v,
            holderObjectId,
            stack,
            depth + 1,
          ),
        );
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
      if (FORBIDDEN_PARAM_KEYS.has(key)) {
        throw new Error(
          `Invalid arguments for mcp.${toolName}: forbidden key "${key}".`,
        );
      }
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
      setOwnProperty(paramsCopy, key, val);
    }

    const resolveSingleElementProp = async (
      sourceKey: string,
      targetKey: string,
    ): Promise<void> => {
      if (!Object.hasOwn(paramsCopy, sourceKey)) {
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
      if (
        Object.hasOwn(paramsCopy, targetKey) &&
        paramsCopy[targetKey] !== undefined
      ) {
        throw new Error(
          `Specify either "${targetKey}" or "${sourceKey}" on mcp.${toolName}, not both.`,
        );
      }
      const resolved = await this.#describeElementHandle(
        propVal.mcpElementHandle,
        holderObjectId,
      );
      const reg = this.#page.registerEphemeralBackendNode(resolved);
      stack.use(reg);
      setOwnProperty(paramsCopy, targetKey, reg.uid);
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
        const entryCopy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(item)) {
          if (FORBIDDEN_PARAM_KEYS.has(k)) {
            throw new Error(
              `Invalid arguments for mcp.${toolName}: forbidden key "${k}".`,
            );
          }
          setOwnProperty(entryCopy, k, v);
        }
        if (
          Object.hasOwn(entryCopy, 'element') &&
          entryCopy.element !== undefined
        ) {
          const elToken = entryCopy.element;
          delete entryCopy.element;
          if (!isElementHandleToken(elToken)) {
            throw new Error(
              `Invalid "element" in mcp.fill_form elements: expected a live DOM Element.`,
            );
          }
          if (Object.hasOwn(entryCopy, 'uid') && entryCopy.uid !== undefined) {
            throw new Error(
              'Specify either "uid" or "element" in mcp.fill_form elements, not both.',
            );
          }
          const resolved = await this.#describeElementHandle(
            elToken.mcpElementHandle,
            holderObjectId,
          );
          const reg = this.#page.registerEphemeralBackendNode(resolved);
          stack.use(reg);
          setOwnProperty(entryCopy, 'uid', reg.uid);
        }
        normalizedElements.push(entryCopy);
      }
      setOwnProperty(paramsCopy, 'elements', normalizedElements);
    }

    const finalParams: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(paramsCopy)) {
      setOwnProperty(
        finalParams,
        key,
        await this.#normalizeNestedValue(
          toolName,
          val,
          holderObjectId,
          stack,
          1,
        ),
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

      if (
        toolName === 'wait_for' &&
        typeof parsedParams.timeout === 'number' &&
        parsedParams.timeout > MAX_REPL_WAIT_TIMEOUT_MS
      ) {
        throw new Error(
          `Invalid arguments for mcp.wait_for: timeout must not exceed ${MAX_REPL_WAIT_TIMEOUT_MS}ms inside evaluate_script.`,
        );
      }

      const {structuredContent, images} = await this.#context.runReplInnerTool(
        innerTool,
        parsedParams,
        this.#page,
      );

      for (const image of images) {
        if (this.#imagesAttached >= MAX_REPL_IMAGES) {
          throw new Error(
            `Exceeded maximum of ${MAX_REPL_IMAGES} inline screenshots in a single evaluate_script call.`,
          );
        }
        this.#imagesAttached++;
        this.#outerResponse.attachImage(image);
      }

      const structuredRecord: Record<string, unknown> = {
        ok: true,
        ...structuredContent,
      };

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
      return await this.#page.resolveUidInReplContext(uid, this.#contextId);
    });
  }

  async getEventListeners(
    rawTarget: unknown,
    holderObjectId: string,
  ): Promise<DomEventListenerSummary[]> {
    return await this.#runExclusively(async () => {
      if (!isPlainRecord(rawTarget)) {
        throw new Error(
          'mcp.getEventListeners requires { element } or { uid }.',
        );
      }
      for (const key of Object.keys(rawTarget)) {
        if (FORBIDDEN_PARAM_KEYS.has(key)) {
          throw new Error(
            `Invalid arguments for mcp.getEventListeners: forbidden key "${key}".`,
          );
        }
      }

      if (
        Object.hasOwn(rawTarget, 'element') &&
        rawTarget.element !== undefined
      ) {
        if (!isElementHandleToken(rawTarget.element)) {
          throw new Error(
            'Invalid "element" passed to mcp.getEventListeners: expected a live DOM Element.',
          );
        }
        const desc = await this.#describeElementHandle(
          rawTarget.element.mcpElementHandle,
          holderObjectId,
        );
        const {object} = await this.#session.send('DOM.resolveNode', {
          backendNodeId: desc.backendNodeId,
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
      }

      if (typeof rawTarget.uid === 'string' && rawTarget.uid.length > 0) {
        return await this.#page.getDomEventListenersForUid(rawTarget.uid, {
          mainWorld: this.#mainWorld,
        });
      }

      throw new Error(
        'mcp.getEventListeners requires either { element } or { uid }.',
      );
    });
  }
}

export function createReplEvaluateTool(
  cliArgs: ParsedArguments,
  innerTools: readonly AnyToolDefinition[],
  allTools: readonly AnyToolDefinition[],
): DefinedPageTool {
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
        .default(true)
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
      const page = request.page;
      page.throwIfDialogOpen();

      const rawSource = await resolveReplScriptSource(
        request.params.function,
        request.params.sourcePath,
        context,
      );
      const functionSource = stripTrailingSemicolonsAndComments(rawSource);

      const {
        session,
        contextId,
        loaderId: initialLoaderId,
      } = await page.getReplExecutionContext({
        mainWorld: cliArgs.replMainWorld,
      });

      const turnId = crypto.randomUUID().replaceAll('-', '');
      const bindingName = `__mcpCallTool_${turnId}`;
      const objectGroup = `cd4a_repl_turn_${turnId}`;

      const dispatcher = new ReplToolDispatcher({
        page,
        context,
        outerResponse: response,
        session,
        contextId,
        objectGroup,
        mainWorld: cliArgs.replMainWorld,
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

      const waitForPageStableDom = async (): Promise<void> => {
        await page
          .createWaitForHelper(
            page.cpuThrottlingRate,
            getNetworkMultiplierFromString(page.networkConditions),
          )
          .waitForStableDom()
          .catch(() => undefined);
      };

      const writeNavigationEarlyExit = async (): Promise<void> => {
        if (
          request.params.waitForStableDom !== false &&
          dispatcher.completedSteps.every(s => !s.navigatedToUrl)
        ) {
          await waitForPageStableDom();
        }
        const earlyExitJson = JSON.stringify({
          navigated: true,
          newUrl: page.pptrPage.url(),
          completedSteps: dispatcher.completedSteps,
          note: 'Script ended early due to full-page navigation; call evaluate_script again on the new page.',
        });
        await writeReplOutput(earlyExitJson, response, {
          context,
          filePath: request.params.filePath,
        });
      };

      let holderObjectId = '';
      let bindingRegistered = false;
      const pendingBindingTasks = new Set<Promise<void>>();

      const rejectBindingCall = (seq: number, message: string): void => {
        void session
          .send('Runtime.callFunctionOn', {
            objectId: holderObjectId,
            functionDeclaration:
              'function(seq, msg) { this.rejectCall(seq, msg); }',
            arguments: [{value: seq}, {value: message}],
            returnByValue: true,
          })
          .catch(() => undefined);
      };

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
        if (
          Buffer.byteLength(event.payload, 'utf8') > MAX_BINDING_PAYLOAD_BYTES
        ) {
          try {
            const parsed: unknown = JSON.parse(event.payload);
            if (isReplBindingMessage(parsed)) {
              rejectBindingCall(
                parsed.seq,
                'REPL binding payload exceeded maximum size (1 MiB).',
              );
            }
          } catch {
            // Ignore malformed oversized payload.
          }
          return;
        }

        let parsedPayload: unknown;
        try {
          parsedPayload = JSON.parse(event.payload);
        } catch {
          return;
        }
        if (!isReplBindingMessage(parsedPayload)) {
          return;
        }

        if (pendingBindingTasks.size >= MAX_PENDING_BINDING_CALLS) {
          rejectBindingCall(
            parsedPayload.seq,
            `Too many concurrent pending mcp.* calls (limit: ${MAX_PENDING_BINDING_CALLS}). Await each mcp.* call before starting more.`,
          );
          return;
        }

        const {seq, kind, name, params} = parsedPayload;
        const task = (async () => {
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
        })().finally(() => {
          pendingBindingTasks.delete(task);
        });
        pendingBindingTasks.add(task);
      };

      const drainAllInFlight = async (): Promise<void> => {
        while (pendingBindingTasks.size > 0) {
          await Promise.allSettled([...pendingBindingTasks]);
        }
        await dispatcher.drainInFlight();
      };

      session.on('Page.frameNavigated', onFrameNavigated);
      session.on('Runtime.bindingCalled', onBindingCalled);
      page.setReplDialogAction(request.params.dialogAction ?? 'accept');

      try {
        const userFnRes = await session.send('Runtime.evaluate', {
          expression: buildUserFunctionExpression(functionSource),
          contextId,
          includeCommandLineAPI: true,
          objectGroup,
          returnByValue: false,
          awaitPromise: false,
        });

        if (userFnRes.exceptionDetails) {
          throw new Error(extractExceptionMessage(userFnRes.exceptionDetails));
        }
        if (
          userFnRes.result.type !== 'function' ||
          !userFnRes.result.objectId
        ) {
          throw new Error(
            'REPL evaluate_script expects a function (e.g. async (mcp) => { ... }).',
          );
        }
        const userFnObjectId = userFnRes.result.objectId;

        await session.send('Runtime.addBinding', {
          name: bindingName,
          executionContextId: contextId,
        });
        bindingRegistered = true;

        const bootstrapExpression = buildBootstrapExpression({
          bindingName,
          enabledToolNames,
          outerOnlyToolNames,
          disabledInnerToolNames,
        });

        const bootstrapRes = await session.send('Runtime.evaluate', {
          expression: bootstrapExpression,
          contextId,
          includeCommandLineAPI: false,
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
            functionDeclaration:
              'function(userFn) { return this.run(userFn); }',
            arguments: [{objectId: userFnObjectId}],
            awaitPromise: true,
            returnByValue: true,
          });

          if (runRes.exceptionDetails) {
            dispatcher.abort();
            await drainAllInFlight();
            if (!page.isClosed() && (await checkCrossDocumentNavigated())) {
              await writeNavigationEarlyExit();
              return;
            }
            throw new Error(extractExceptionMessage(runRes.exceptionDetails));
          }

          await drainAllInFlight();
          dispatcher.abort();

          const rawValue: unknown = runRes.result.value;
          serializedOutput =
            typeof rawValue === 'string' ? rawValue : 'undefined';
        } catch (error) {
          dispatcher.abort();
          await drainAllInFlight();
          if (
            !page.isClosed() &&
            isContextDestructionError(error) &&
            (await checkCrossDocumentNavigated())
          ) {
            await writeNavigationEarlyExit();
            return;
          }
          throw error;
        }

        if (request.params.waitForStableDom !== false) {
          await waitForPageStableDom();
        }

        await writeReplOutput(serializedOutput, response, {
          context,
          filePath: request.params.filePath,
        });
      } finally {
        dispatcher.abort();
        page.setReplDialogAction(undefined);
        session.off('Runtime.bindingCalled', onBindingCalled);
        session.off('Page.frameNavigated', onFrameNavigated);
        if (bindingRegistered) {
          await session
            .send('Runtime.removeBinding', {name: bindingName})
            .catch(() => undefined);
          await session
            .send('Runtime.evaluate', {
              expression: `delete globalThis[${JSON.stringify(bindingName)}];`,
              contextId,
              silent: true,
            })
            .catch(() => undefined);
        }
        await session
          .send('Runtime.releaseObjectGroup', {objectGroup})
          .catch(() => undefined);
      }
    },
  }));

  return factory(cliArgs);
}
