/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {STRIPPED_INNER_PARAMS} from './replPartition.js';
import type {AnyToolDefinition, ToolSchema} from './ToolDefinition.js';

/* eslint-disable @local/enforce-zod-schema -- outputSchema describes nested structuredContent JSON objects. */
export const paginationOutputObjectSchema: zod.ZodType = zod
  .object({
    currentPage: zod.number(),
    totalPages: zod.number(),
    hasNextPage: zod.boolean(),
    hasPreviousPage: zod.boolean(),
    startIndex: zod.number(),
    endIndex: zod.number(),
    invalidPage: zod.boolean(),
  })
  .passthrough();

export const actionOutputSchema: ToolSchema = {
  ok: zod.boolean(),
  navigatedToUrl: zod.string().optional(),
  dialogHandled: zod.boolean().optional(),
  snapshot: zod.record(zod.string(), zod.unknown()).optional(),
};

export const typeTextOutputSchema: ToolSchema = {
  ok: zod.boolean(),
  navigatedToUrl: zod.string().optional(),
  dialogHandled: zod.boolean().optional(),
};

export const waitForOutputSchema: ToolSchema = {
  ok: zod.boolean(),
  snapshot: zod.record(zod.string(), zod.unknown()).optional(),
};

export const takeSnapshotOutputSchema: ToolSchema = {
  snapshot: zod
    .object({
      id: zod.string(),
      role: zod.string().optional(),
      name: zod.string().optional(),
      children: zod.array(zod.record(zod.string(), zod.unknown())).optional(),
    })
    .passthrough()
    .optional(),
};

export const messageOutputSchema: ToolSchema = {
  message: zod.string().optional(),
};

export const cssStylesOutputSchema: ToolSchema = {
  matchedStyles: zod
    .object({
      element: zod.object({
        uid: zod.string(),
        selector: zod.string(),
      }),
      rules: zod.array(zod.record(zod.string(), zod.unknown())),
    })
    .passthrough(),
  pagination: paginationOutputObjectSchema.optional(),
};

export const listConsoleMessagesOutputSchema: ToolSchema = {
  consoleMessages: zod.array(
    zod
      .object({
        id: zod.number(),
        type: zod.string(),
        text: zod.string().optional(),
        title: zod.string().optional(),
        argsCount: zod.number().optional(),
        count: zod.number().optional(),
        stackTrace: zod.string().optional(),
      })
      .passthrough(),
  ),
  pagination: paginationOutputObjectSchema.optional(),
};

export const getConsoleMessageOutputSchema: ToolSchema = {
  consoleMessage: zod
    .object({
      id: zod.number(),
      type: zod.string(),
      text: zod.string().optional(),
      args: zod.array(zod.string()).optional(),
      stackTrace: zod.string().optional(),
      title: zod.string().optional(),
      description: zod.string().optional(),
    })
    .passthrough()
    .optional(),
};

export const listNetworkRequestsOutputSchema: ToolSchema = {
  networkRequests: zod.array(
    zod
      .object({
        requestId: zod.number().optional(),
        method: zod.string(),
        url: zod.string(),
        status: zod.string(),
        selectedInDevToolsUI: zod.boolean().optional(),
      })
      .passthrough(),
  ),
  pagination: paginationOutputObjectSchema.optional(),
};

export const getNetworkRequestOutputSchema: ToolSchema = {
  networkRequest: zod
    .object({
      requestId: zod.number().optional(),
      method: zod.string(),
      url: zod.string(),
      status: zod.string(),
      requestHeaders: zod.record(zod.string(), zod.string()),
      requestBody: zod.string().optional(),
      responseHeaders: zod.record(zod.string(), zod.string()).optional(),
      responseBody: zod.string().optional(),
      failure: zod.string().optional(),
    })
    .passthrough()
    .optional(),
  message: zod.string().optional(),
};

export const listWebMcpToolsOutputSchema: ToolSchema = {
  webmcpTools: zod
    .array(
      zod
        .object({
          name: zod.string(),
          description: zod.string().optional(),
          inputSchema: zod.record(zod.string(), zod.unknown()).optional(),
        })
        .passthrough(),
    )
    .optional(),
};

export const listThirdPartyToolsOutputSchema: ToolSchema = {
  thirdPartyDeveloperTools: zod
    .array(
      zod
        .object({
          name: zod.string(),
          description: zod.string(),
          tools: zod.array(
            zod
              .object({
                name: zod.string(),
                description: zod.string(),
                inputSchema: zod.record(zod.string(), zod.unknown()).optional(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    )
    .optional(),
};
/* eslint-enable @local/enforce-zod-schema */

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isZodSchema(value: unknown): value is zod.ZodType {
  return (
    isPlainRecord(value) &&
    '_zod' in value &&
    isPlainRecord(value._zod) &&
    'def' in value._zod &&
    isPlainRecord(value._zod.def)
  );
}

function isToolSchema(value: unknown): value is ToolSchema {
  if (!isPlainRecord(value)) {
    return false;
  }
  for (const entry of Object.values(value)) {
    if (!isZodSchema(entry)) {
      return false;
    }
  }
  return true;
}

const VALID_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function formatPropertyKey(key: string): string {
  return VALID_IDENTIFIER_REGEX.test(key) ? key : JSON.stringify(key);
}

function formatLiteralValue(value: unknown): string {
  if (typeof value === 'string') {
    return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value);
  }
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }
  return 'unknown';
}

function isFieldOptional(schema: zod.ZodType): boolean {
  return (
    schema._zod.optin !== undefined ||
    schema._zod.optout !== undefined ||
    schema._zod.def.type === 'optional' ||
    schema._zod.def.type === 'default' ||
    schema._zod.def.type === 'prefault'
  );
}

function zodTypeToTs(schema: zod.ZodType, seen: Set<object>): string {
  if (seen.has(schema)) {
    return 'Record<string, unknown>';
  }
  const def = schema._zod.def;
  switch (def.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'int':
    case 'nan':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'bigint':
      return 'bigint';
    case 'null':
      return 'null';
    case 'undefined':
    case 'void':
      return 'undefined';
    case 'never':
      return 'never';
    case 'any':
    case 'unknown':
      return 'unknown';
    case 'enum':
    case 'literal': {
      const values = schema._zod.values;
      if (values && values.size > 0) {
        const parts: string[] = [];
        for (const item of values) {
          parts.push(formatLiteralValue(item));
        }
        return parts.join(' | ');
      }
      if ('entries' in def && isPlainRecord(def.entries)) {
        const parts: string[] = [];
        for (const item of Object.values(def.entries)) {
          parts.push(formatLiteralValue(item));
        }
        if (parts.length > 0) {
          return parts.join(' | ');
        }
      }
      return 'string';
    }
    case 'optional':
    case 'default':
    case 'prefault':
    case 'nonoptional':
    case 'readonly':
    case 'catch': {
      if ('innerType' in def && isZodSchema(def.innerType)) {
        return zodTypeToTs(def.innerType, seen);
      }
      return 'unknown';
    }
    case 'nullable': {
      if ('innerType' in def && isZodSchema(def.innerType)) {
        return `${zodTypeToTs(def.innerType, seen)} | null`;
      }
      return 'unknown';
    }
    case 'pipe': {
      if (
        'in' in def &&
        'out' in def &&
        isZodSchema(def.in) &&
        isZodSchema(def.out)
      ) {
        return def.in._zod.def.type === 'transform'
          ? zodTypeToTs(def.out, seen)
          : zodTypeToTs(def.in, seen);
      }
      return 'unknown';
    }
    case 'array': {
      if ('element' in def && isZodSchema(def.element)) {
        const elemTs = zodTypeToTs(def.element, seen);
        return elemTs.includes(' | ') && !elemTs.startsWith('{')
          ? `Array<${elemTs}>`
          : `${elemTs}[]`;
      }
      return 'unknown[]';
    }
    case 'object': {
      if ('shape' in def && isToolSchema(def.shape)) {
        const nextSeen = new Set(seen);
        nextSeen.add(schema);
        return zodShapeToTsWithSeen(def.shape, nextSeen);
      }
      return 'Record<string, unknown>';
    }
    case 'record': {
      const keyTs =
        'keyType' in def && isZodSchema(def.keyType)
          ? zodTypeToTs(def.keyType, seen)
          : 'string';
      const valTs =
        'valueType' in def && isZodSchema(def.valueType)
          ? zodTypeToTs(def.valueType, seen)
          : 'unknown';
      return `Record<${keyTs}, ${valTs}>`;
    }
    case 'union': {
      if ('options' in def && Array.isArray(def.options)) {
        const parts: string[] = [];
        for (const option of def.options) {
          if (isZodSchema(option)) {
            parts.push(zodTypeToTs(option, seen));
          }
        }
        if (parts.length > 0) {
          return parts.join(' | ');
        }
      }
      return 'unknown';
    }
    case 'lazy': {
      if ('getter' in def && typeof def.getter === 'function') {
        const nextSeen = new Set(seen);
        nextSeen.add(schema);
        const resolved: unknown = def.getter();
        if (isZodSchema(resolved)) {
          return zodTypeToTs(resolved, nextSeen);
        }
      }
      return 'Record<string, unknown>';
    }
    default:
      return 'unknown';
  }
}

function zodShapeToTsWithSeen(shape: ToolSchema, seen: Set<object>): string {
  if (!isPlainRecord(shape)) {
    return '{}';
  }
  const entries = Object.entries(shape);
  if (entries.length === 0) {
    return '{}';
  }
  const fields: string[] = [];
  for (const [key, fieldSchema] of entries) {
    if (!isZodSchema(fieldSchema)) {
      continue;
    }
    const optionalSuffix = isFieldOptional(fieldSchema) ? '?' : '';
    const fieldTs = zodTypeToTs(fieldSchema, seen);
    fields.push(`${formatPropertyKey(key)}${optionalSuffix}: ${fieldTs}`);
  }
  if (fields.length === 0) {
    return '{}';
  }
  return `{ ${fields.join('; ')} }`;
}

export function zodShapeToTs(shape: ToolSchema): string {
  return zodShapeToTsWithSeen(shape, new Set());
}

function stripReplMethodInputSchema(schema: ToolSchema): ToolSchema {
  const stripped: ToolSchema = {};
  for (const [key, fieldSchema] of Object.entries(schema)) {
    if (key === 'pageId' || STRIPPED_INNER_PARAMS.has(key)) {
      continue;
    }
    stripped[key] = fieldSchema;
  }
  return stripped;
}

export function formatReplToolMethodSignature(tool: AnyToolDefinition): string {
  if (!isPlainRecord(tool) || typeof tool.name !== 'string' || !tool.schema) {
    return '';
  }

  const inputSchema = stripReplMethodInputSchema(tool.schema);
  const inputEntries = Object.entries(inputSchema);
  let paramsPart = '';
  if (inputEntries.length > 0) {
    const allOptional = inputEntries.every(
      ([, fieldSchema]) =>
        isZodSchema(fieldSchema) && isFieldOptional(fieldSchema),
    );
    const inputTs = zodShapeToTs(inputSchema);
    paramsPart = `params${allOptional ? '?' : ''}: ${inputTs}`;
  }

  const outputTs =
    tool.outputSchema && Object.keys(tool.outputSchema).length > 0
      ? zodShapeToTs(tool.outputSchema)
      : '{ ok: boolean }';

  return `${tool.name}(${paramsPart}): Promise<${outputTs}>;`;
}

const PAGINATION_TS = zodShapeToTs({
  currentPage: zod.number(),
  totalPages: zod.number(),
  hasNextPage: zod.boolean(),
  hasPreviousPage: zod.boolean(),
  startIndex: zod.number(),
  endIndex: zod.number(),
  invalidPage: zod.boolean(),
});

const ACTION_RESULT_TS = zodShapeToTs(actionOutputSchema);

export function buildReplApiDeclaration(
  innerTools: readonly AnyToolDefinition[],
): string {
  if (!Array.isArray(innerTools)) {
    return '';
  }

  const rawSignatures: string[] = [];
  for (const tool of innerTools) {
    const sig = formatReplToolMethodSignature(tool);
    if (sig) {
      rawSignatures.push(sig);
    }
  }

  const typeAliases: string[] = [
    `type ActionResult = ${ACTION_RESULT_TS};`,
    `type Pagination = ${PAGINATION_TS};`,
  ];

  const methodLines = rawSignatures.map(sig =>
    sig
      .replaceAll(`Promise<${ACTION_RESULT_TS}>`, 'Promise<ActionResult>')
      .replaceAll(`pagination?: ${PAGINATION_TS}`, 'pagination?: Pagination')
      .replaceAll('{ uid: string;', '{ uid?: string; element?: Element;')
      .replaceAll('{ uid: string }', '{ uid?: string; element?: Element }')
      .replaceAll('uid?: string;', 'uid?: string; element?: Element;'),
  );

  methodLines.push(
    'getElement(uid: string): Promise<Element | null>;',
    'getEventListeners(target: { element?: Element; uid?: string }): Promise<Array<{ type: string; useCapture: boolean; passive: boolean; once: boolean; lineNumber: number; columnNumber: number }>>;',
  );

  const consoleHelpers = [
    'declare function $(selector: string, startNode?: Node): Element | null;',
    'declare function $$(selector: string, startNode?: Node): Element[];',
    'declare function $x(xpath: string, startNode?: Node): Node[];',
    'declare function getAccessibleName(node: Node): string;',
    'declare function getAccessibleRole(node: Node): string;',
    'declare function monitorEvents(object: EventTarget, events?: string | string[]): void;',
    'declare function unmonitorEvents(object: EventTarget, events?: string | string[]): void;',
  ];

  return [
    ...typeAliases,
    'interface McpTools {',
    ...methodLines.map(line => `  ${line}`),
    '}',
    ...consoleHelpers,
  ].join('\n');
}
