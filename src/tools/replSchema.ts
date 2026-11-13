/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {StructuredCssStyles} from '../formatters/CssFormatter.js';
import {zod} from '../third_party/index.js';

import {STRIPPED_INNER_PARAMS} from './replPartition.js';
import type {AnyToolDefinition, ToolSchema} from './ToolDefinition.js';

export type SnapshotPrimitiveAttribute = string | number | boolean;

export interface SnapshotJsonNode {
  id?: string;
  role?: string;
  name?: string;
  children?: SnapshotJsonNode[];
  [key: string]: SnapshotPrimitiveAttribute | SnapshotJsonNode[] | undefined;
}

/* eslint-disable @local/enforce-zod-schema -- outputSchema describes nested structuredContent JSON objects. */
export const paginationOutputObjectSchema: zod.ZodObject<
  {
    currentPage: zod.ZodNumber;
    totalPages: zod.ZodNumber;
    hasNextPage: zod.ZodBoolean;
    hasPreviousPage: zod.ZodBoolean;
    startIndex: zod.ZodNumber;
    endIndex: zod.ZodNumber;
    invalidPage: zod.ZodBoolean;
  },
  zod.core.$strict
> = zod
  .object({
    currentPage: zod.number(),
    totalPages: zod.number(),
    hasNextPage: zod.boolean(),
    hasPreviousPage: zod.boolean(),
    startIndex: zod.number(),
    endIndex: zod.number(),
    invalidPage: zod.boolean(),
  })
  .strict();

export type PaginationOutput = zod.output<typeof paginationOutputObjectSchema>;

export const snapshotNodeSchema: zod.ZodType<SnapshotJsonNode> = zod.lazy(() =>
  zod
    .object({
      id: zod.string().optional(),
      role: zod.string().optional(),
      name: zod.string().optional(),
      children: zod.array(snapshotNodeSchema).optional(),
    })
    .catchall(zod.union([zod.string(), zod.number(), zod.boolean()])),
);

export const actionOutputSchema: ToolSchema = {
  ok: zod.boolean(),
  navigatedToUrl: zod.string().optional(),
  dialogHandled: zod.boolean().optional(),
  snapshot: snapshotNodeSchema.optional(),
};

export const typeTextOutputSchema: ToolSchema = {
  ok: zod.boolean(),
  navigatedToUrl: zod.string().optional(),
  dialogHandled: zod.boolean().optional(),
};

export const waitForOutputSchema: ToolSchema = {
  ok: zod.boolean(),
  snapshot: snapshotNodeSchema.optional(),
};

export const takeSnapshotOutputSchema: ToolSchema = {
  snapshot: snapshotNodeSchema.optional(),
};

export const messageOutputSchema: ToolSchema = {
  message: zod.string().optional(),
};

export const executeThirdPartyToolOutputSchema: ToolSchema = {
  message: zod.string().optional(),
  snapshot: snapshotNodeSchema.optional(),
};

const cssPropertyStatusSchema = zod.enum([
  'active',
  'overloaded',
  'invalid',
  'disabled',
]);

const cssNodeRefSchema = zod
  .object({
    selector: zod.string(),
    uid: zod.string().optional(),
  })
  .strict();

const ancestorCssRuleSchema = zod.union([
  zod
    .object({
      type: zod.literal('layer'),
      name: zod.string().optional(),
    })
    .strict(),
  zod
    .object({
      type: zod.enum(['media', 'supports', 'navigation']),
      query: zod.string(),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('scope'),
      query: zod.string().optional(),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('container'),
      query: zod.string(),
      name: zod.string().optional(),
      container: cssNodeRefSchema.optional(),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('starting-style'),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('nesting'),
      selector: zod.string(),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('at-rule'),
      atRuleType: zod.string(),
      name: zod.string().optional(),
    })
    .strict(),
]);

const structuredCssPropertySchema = zod
  .object({
    name: zod.string(),
    value: zod.string(),
    status: cssPropertyStatusSchema,
    important: zod.boolean().optional(),
  })
  .strict();

const keyframeStepSchema = zod
  .object({
    keyText: zod.string(),
    source: zod.string().optional(),
    properties: zod.array(structuredCssPropertySchema),
  })
  .strict();

const cascadeRuleSchema = zod.union([
  zod
    .object({
      type: zod.enum(['inline', 'attributes', 'transition']),
      selector: zod.string(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('animation'),
      name: zod.string().optional(),
      selector: zod.string(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('matched'),
      selector: zod.string(),
      matchingSelectors: zod.array(zod.string()).optional(),
      source: zod.string().optional(),
      isUserAgent: zod.boolean().optional(),
      ancestors: zod.array(ancestorCssRuleSchema).optional(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('inherited'),
      node: cssNodeRefSchema,
      selector: zod.string().optional(),
      matchingSelectors: zod.array(zod.string()).optional(),
      source: zod.string().optional(),
      ancestors: zod.array(ancestorCssRuleSchema).optional(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('pseudo'),
      pseudoType: zod.string(),
      node: cssNodeRefSchema.optional(),
      selector: zod.string().optional(),
      matchingSelectors: zod.array(zod.string()).optional(),
      source: zod.string().optional(),
      ancestors: zod.array(ancestorCssRuleSchema).optional(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('keyframes'),
      name: zod.string(),
      selector: zod.string(),
      source: zod.string().optional(),
      keyframes: zod.array(keyframeStepSchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('at-rule'),
      atRuleType: zod.string(),
      name: zod.string().optional(),
      subsection: zod.string().optional(),
      selector: zod.string(),
      source: zod.string().optional(),
      ancestors: zod.array(ancestorCssRuleSchema).optional(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('position-try'),
      name: zod.string(),
      active: zod.boolean(),
      selector: zod.string(),
      source: zod.string().optional(),
      ancestors: zod.array(ancestorCssRuleSchema).optional(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('property'),
      name: zod.string(),
      selector: zod.string(),
      source: zod.string().optional(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
  zod
    .object({
      type: zod.literal('function'),
      name: zod.string(),
      selector: zod.string(),
      source: zod.string().optional(),
      properties: zod.array(structuredCssPropertySchema),
    })
    .strict(),
]);

const rawStructuredCssStylesSchema = zod
  .object({
    element: zod
      .object({
        uid: zod.string(),
        selector: zod.string(),
      })
      .strict(),
    rules: zod.array(cascadeRuleSchema),
  })
  .strict();

type StructuredCssStylesSchemaOutput = zod.output<
  typeof rawStructuredCssStylesSchema
>;
const verifyCssStylesToSchema: (
  styles: StructuredCssStyles,
) => StructuredCssStylesSchemaOutput = styles => styles;
const verifySchemaToCssStyles: (
  styles: StructuredCssStylesSchemaOutput,
) => StructuredCssStyles = styles => styles;
void verifyCssStylesToSchema;
void verifySchemaToCssStyles;

export const structuredCssStylesSchema: zod.ZodType<StructuredCssStyles> =
  rawStructuredCssStylesSchema;

export const cssStylesOutputSchema: ToolSchema = {
  matchedStyles: structuredCssStylesSchema,
  pagination: paginationOutputObjectSchema.optional(),
};

const consoleMessageConciseShape = {
  id: zod.number(),
  type: zod.string(),
  text: zod.string(),
  argsCount: zod.number(),
  count: zod.number().optional(),
  stackTrace: zod.string().optional(),
};

export const consoleMessageConciseSchema: zod.ZodObject<
  {
    id: zod.ZodNumber;
    type: zod.ZodString;
    text: zod.ZodString;
    argsCount: zod.ZodNumber;
    count: zod.ZodOptional<zod.ZodNumber>;
    stackTrace: zod.ZodOptional<zod.ZodString>;
  },
  zod.core.$strict
> = zod.object(consoleMessageConciseShape).strict();

export type ConsoleMessageConcise = zod.output<
  typeof consoleMessageConciseSchema
>;

export const consoleMessageDetailedSchema: zod.ZodObject<
  {
    id: zod.ZodNumber;
    type: zod.ZodString;
    text: zod.ZodString;
    argsCount: zod.ZodNumber;
    count: zod.ZodOptional<zod.ZodNumber>;
    stackTrace: zod.ZodOptional<zod.ZodString>;
    args: zod.ZodArray<zod.ZodString>;
  },
  zod.core.$strict
> = zod
  .object({
    ...consoleMessageConciseShape,
    args: zod.array(zod.string()),
  })
  .strict();

export type ConsoleMessageDetailed = zod.output<
  typeof consoleMessageDetailedSchema
>;

export const affectedResourceSchema: zod.ZodObject<
  {
    uid: zod.ZodOptional<zod.ZodString>;
    data: zod.ZodOptional<zod.ZodUnknown>;
    request: zod.ZodOptional<
      zod.ZodUnion<readonly [zod.ZodString, zod.ZodNumber]>
    >;
  },
  zod.core.$strict
> = zod
  .object({
    uid: zod.string().optional(),
    data: zod.unknown().optional(),
    request: zod.union([zod.string(), zod.number()]).optional(),
  })
  .strict();

export type AffectedResource = zod.output<typeof affectedResourceSchema>;

const issueConciseShape = {
  id: zod.number(),
  type: zod.literal('issue'),
  title: zod.string().optional(),
  count: zod.number(),
};

export const issueConciseSchema: zod.ZodObject<
  {
    id: zod.ZodNumber;
    type: zod.ZodLiteral<'issue'>;
    title: zod.ZodOptional<zod.ZodString>;
    count: zod.ZodNumber;
  },
  zod.core.$strict
> = zod.object(issueConciseShape).strict();

export type IssueConcise = zod.output<typeof issueConciseSchema>;

type IssueLinkSchema = zod.ZodObject<
  {
    link: zod.ZodString;
    linkTitle: zod.ZodString;
  },
  zod.core.$strict
>;

const issueLinkSchema: IssueLinkSchema = zod
  .object({
    link: zod.string(),
    linkTitle: zod.string(),
  })
  .strict();

export const issueDetailedSchema: zod.ZodObject<
  {
    id: zod.ZodNumber;
    type: zod.ZodLiteral<'issue'>;
    title: zod.ZodOptional<zod.ZodString>;
    count: zod.ZodNumber;
    description: zod.ZodOptional<zod.ZodString>;
    links: zod.ZodOptional<zod.ZodArray<IssueLinkSchema>>;
    affectedResources: zod.ZodArray<typeof affectedResourceSchema>;
  },
  zod.core.$strict
> = zod
  .object({
    ...issueConciseShape,
    description: zod.string().optional(),
    links: zod.array(issueLinkSchema).optional(),
    affectedResources: zod.array(affectedResourceSchema),
  })
  .strict();

export type IssueDetailed = zod.output<typeof issueDetailedSchema>;

export const listConsoleMessagesOutputSchema: ToolSchema = {
  consoleMessages: zod.array(
    zod.union([consoleMessageConciseSchema, issueConciseSchema]),
  ),
  pagination: paginationOutputObjectSchema.optional(),
};

export const getConsoleMessageOutputSchema: ToolSchema = {
  consoleMessage: zod
    .union([consoleMessageDetailedSchema, issueDetailedSchema])
    .optional(),
};

const networkRequestConciseShape = {
  requestId: zod.union([zod.number(), zod.string()]).optional(),
  method: zod.string(),
  url: zod.string(),
  status: zod.string(),
  selectedInDevToolsUI: zod.boolean().optional(),
};

export const networkRequestConciseSchema: zod.ZodObject<
  {
    requestId: zod.ZodOptional<
      zod.ZodUnion<readonly [zod.ZodNumber, zod.ZodString]>
    >;
    method: zod.ZodString;
    url: zod.ZodString;
    status: zod.ZodString;
    selectedInDevToolsUI: zod.ZodOptional<zod.ZodBoolean>;
  },
  zod.core.$strict
> = zod.object(networkRequestConciseShape).strict();

export type NetworkRequestConcise = zod.output<
  typeof networkRequestConciseSchema
>;

export const networkRequestDetailedSchema: zod.ZodObject<
  {
    requestId: zod.ZodOptional<
      zod.ZodUnion<readonly [zod.ZodNumber, zod.ZodString]>
    >;
    method: zod.ZodString;
    url: zod.ZodString;
    status: zod.ZodString;
    selectedInDevToolsUI: zod.ZodOptional<zod.ZodBoolean>;
    requestHeaders: zod.ZodRecord<zod.ZodString, zod.ZodString>;
    requestBody: zod.ZodOptional<zod.ZodString>;
    requestBodyFilePath: zod.ZodOptional<zod.ZodString>;
    responseHeaders: zod.ZodOptional<
      zod.ZodRecord<zod.ZodString, zod.ZodString>
    >;
    responseBody: zod.ZodOptional<zod.ZodString>;
    responseBodyFilePath: zod.ZodOptional<zod.ZodString>;
    failure: zod.ZodOptional<zod.ZodString>;
    redirectChain: zod.ZodOptional<
      zod.ZodArray<typeof networkRequestConciseSchema>
    >;
  },
  zod.core.$strict
> = zod
  .object({
    ...networkRequestConciseShape,
    requestHeaders: zod.record(zod.string(), zod.string()),
    requestBody: zod.string().optional(),
    requestBodyFilePath: zod.string().optional(),
    responseHeaders: zod.record(zod.string(), zod.string()).optional(),
    responseBody: zod.string().optional(),
    responseBodyFilePath: zod.string().optional(),
    failure: zod.string().optional(),
    redirectChain: zod.array(networkRequestConciseSchema).optional(),
  })
  .strict();

export type NetworkRequestDetailed = zod.output<
  typeof networkRequestDetailedSchema
>;

export const listNetworkRequestsOutputSchema: ToolSchema = {
  networkRequests: zod.array(networkRequestConciseSchema),
  pagination: paginationOutputObjectSchema.optional(),
};

export const getNetworkRequestOutputSchema: ToolSchema = {
  networkRequest: networkRequestDetailedSchema.optional(),
  message: zod.string().optional(),
};

export const webMcpToolSummarySchema: zod.ZodObject<
  {
    name: zod.ZodString;
    description: zod.ZodOptional<zod.ZodString>;
    inputSchema: zod.ZodOptional<zod.ZodRecord<zod.ZodString, zod.ZodUnknown>>;
    annotations: zod.ZodOptional<zod.ZodRecord<zod.ZodString, zod.ZodUnknown>>;
  },
  zod.core.$strict
> = zod
  .object({
    name: zod.string(),
    description: zod.string().optional(),
    inputSchema: zod.record(zod.string(), zod.unknown()).optional(),
    annotations: zod.record(zod.string(), zod.unknown()).optional(),
  })
  .strict();

export type WebMcpToolSummary = zod.output<typeof webMcpToolSummarySchema>;

export const listWebMcpToolsOutputSchema: ToolSchema = {
  webmcpTools: zod.array(webMcpToolSummarySchema).optional(),
};

const thirdPartyToolItemSchema = zod
  .object({
    name: zod.string(),
    description: zod.string(),
    inputSchema: zod.record(zod.string(), zod.unknown()).optional(),
  })
  .strict();

const thirdPartyToolGroupSchema = zod
  .object({
    name: zod.string(),
    description: zod.string(),
    tools: zod.array(thirdPartyToolItemSchema),
  })
  .strict();

export const listThirdPartyToolsOutputSchema: ToolSchema = {
  thirdPartyDeveloperTools: zod.array(thirdPartyToolGroupSchema).optional(),
};

const structuredOpenedPageSchema = zod
  .object({
    id: zod.number().optional(),
    url: zod.string(),
    title: zod.string(),
    selected: zod.boolean(),
    isolatedContext: zod.string().optional(),
    webauthn: zod.string().optional(),
  })
  .strict();

const structuredDialogSchema = zod
  .object({
    type: zod.string(),
    message: zod.string(),
    defaultValue: zod.string().optional(),
  })
  .strict();

const structuredViewportSchema = zod
  .object({
    width: zod.number(),
    height: zod.number(),
    deviceScaleFactor: zod.number().optional(),
    isMobile: zod.boolean().optional(),
    isLandscape: zod.boolean().optional(),
    hasTouch: zod.boolean().optional(),
  })
  .strict();

const structuredGeolocationSchema = zod
  .object({
    latitude: zod.number(),
    longitude: zod.number(),
  })
  .strict();

export const ambientMcpResponseOutputSchema: ToolSchema = {
  ok: zod.boolean().optional(),
  message: zod.string().optional(),
  reconnected: zod.boolean().optional(),
  openedPages: zod.array(structuredOpenedPageSchema).optional(),
  dialog: structuredDialogSchema.optional(),
  networkConditions: zod.string().optional(),
  navigationTimeout: zod.number().optional(),
  geolocation: structuredGeolocationSchema.optional(),
  viewport: structuredViewportSchema.optional(),
  userAgent: zod.string().optional(),
  cpuThrottlingRate: zod.number().optional(),
  colorScheme: zod.string().optional(),
  forcedColors: zod.string().optional(),
  prefersContrast: zod.string().optional(),
  prefersReducedMotion: zod.string().optional(),
  snapshotFilePath: zod.string().optional(),
};

export function buildStrictRuntimeOutputSchema(
  outputSchema: ToolSchema,
): zod.ZodObject<zod.ZodRawShape, zod.core.$strict> {
  if (!isToolSchema(outputSchema)) {
    return zod.object({}).strict();
  }
  return zod
    .object({
      ...ambientMcpResponseOutputSchema,
      ...outputSchema,
    })
    .strict();
}
/* eslint-enable @local/enforce-zod-schema */

export function formatZodOutputValidationError(
  toolName: string,
  error: zod.ZodError,
): string {
  if (typeof toolName !== 'string' || !error || !Array.isArray(error.issues)) {
    return '';
  }
  const details = error.issues
    .map(
      issue =>
        `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
    )
    .join(', ');
  return `Invalid output for ${toolName} (outputSchema mismatch): ${details}`;
}

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
        return elemTs.includes(' | ') ? `Array<${elemTs}>` : `${elemTs}[]`;
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

function compactTsWhitespace(ts: string): string {
  return ts
    .replaceAll('{ ', '{')
    .replaceAll(' }', '}')
    .replaceAll('; ', ';')
    .replaceAll(': ', ':')
    .replaceAll(' | ', '|');
}

function collectCascadeRuleTypeLiterals(): string {
  const def = cascadeRuleSchema._zod.def;
  const literals: string[] = [];
  if ('options' in def && Array.isArray(def.options)) {
    for (const option of def.options) {
      if (
        isZodSchema(option) &&
        'shape' in option._zod.def &&
        isToolSchema(option._zod.def.shape) &&
        isZodSchema(option._zod.def.shape.type)
      ) {
        const typeTs = zodTypeToTs(option._zod.def.shape.type, new Set());
        for (const part of typeTs.split(' | ')) {
          if (!literals.includes(part)) {
            literals.push(part);
          }
        }
      }
    }
  }
  return literals.length > 0 ? literals.join('|') : 'string';
}

const SNAPSHOT_NODE_RAW_TS = zodTypeToTs(snapshotNodeSchema, new Set());
const PAGINATION_TS = zodTypeToTs(paginationOutputObjectSchema, new Set());
const ACTION_RESULT_RAW_TS = zodShapeToTs(actionOutputSchema);
const NET_CONCISE_TS = zodTypeToTs(networkRequestConciseSchema, new Set());
const NET_DETAILED_TS = zodTypeToTs(networkRequestDetailedSchema, new Set());
const CONSOLE_CONCISE_TS = zodTypeToTs(consoleMessageConciseSchema, new Set());
const CONSOLE_DETAILED_TS = zodTypeToTs(
  consoleMessageDetailedSchema,
  new Set(),
);
const ISSUE_CONCISE_TS = zodTypeToTs(issueConciseSchema, new Set());
const ISSUE_DETAILED_TS = zodTypeToTs(issueDetailedSchema, new Set());
const CSS_PROP_TS = zodTypeToTs(structuredCssPropertySchema, new Set());
const CSS_STYLES_RAW_TS = zodTypeToTs(structuredCssStylesSchema, new Set());
const CSS_RULE_TYPES_TS = collectCascadeRuleTypeLiterals();

export function buildReplApiDeclaration(
  innerTools: readonly AnyToolDefinition[],
): string {
  if (!Array.isArray(innerTools)) {
    return '';
  }

  const netDetailExtraFields: ToolSchema = {};
  for (const [k, v] of Object.entries(networkRequestDetailedSchema.shape)) {
    if (
      !(k in networkRequestConciseShape) &&
      k !== 'requestBodyFilePath' &&
      k !== 'responseBodyFilePath'
    ) {
      netDetailExtraFields[k] = v;
    }
  }
  const netDetailExtraTs = zodShapeToTs(netDetailExtraFields)
    .replaceAll(`Array<${NET_CONCISE_TS}>`, 'NetReq[]')
    .replaceAll(`${NET_CONCISE_TS}[]`, 'NetReq[]');

  const issueDetailExtraFields: ToolSchema = {};
  for (const [k, v] of Object.entries(issueDetailedSchema.shape)) {
    if (!(k in issueConciseShape)) {
      issueDetailExtraFields[k] = v;
    }
  }
  const issueDetailExtraTs = zodShapeToTs(issueDetailExtraFields);

  const typeAliases: string[] = [
    compactTsWhitespace(
      'type SnapshotNode = { id?: string; role?: string; name?: string; children?: SnapshotNode[]; [key: string]: unknown };',
    ),
    compactTsWhitespace(
      `type ActionResult = ${ACTION_RESULT_RAW_TS.replaceAll(SNAPSHOT_NODE_RAW_TS, 'SnapshotNode')};`,
    ),
    compactTsWhitespace(`type Pagination = ${PAGINATION_TS};`),
    compactTsWhitespace(`type NetReq = ${NET_CONCISE_TS};`),
    compactTsWhitespace(`type ConsoleMsg = ${CONSOLE_CONCISE_TS};`),
    compactTsWhitespace(`type IssueMsg = ${ISSUE_CONCISE_TS};`),
    compactTsWhitespace(`type CssProp = ${CSS_PROP_TS};`),
    compactTsWhitespace(
      `type CssRule = { type: ${CSS_RULE_TYPES_TS}; selector?: string; name?: string; source?: string; matchingSelectors?: string[]; isUserAgent?: boolean; active?: boolean; pseudoType?: string; atRuleType?: string; subsection?: string; node?: { selector: string; uid?: string }; ancestors?: Array<{ type: string; name?: string; query?: string; selector?: string; atRuleType?: string; container?: { selector: string; uid?: string } }>; properties?: CssProp[]; keyframes?: Array<{ keyText: string; source?: string; properties: CssProp[] }> };`,
    ),
  ];

  const methodLines: string[] = [];
  for (const tool of innerTools) {
    const rawSig = formatReplToolMethodSignature(tool);
    if (!rawSig) {
      continue;
    }
    const splitIdx = rawSig.indexOf('): Promise<');
    if (splitIdx === -1) {
      methodLines.push(compactTsWhitespace(rawSig));
      continue;
    }
    const head = rawSig
      .slice(0, splitIdx)
      .replace(/\buid\??:\s*string\b/g, 'uid?: string; element?: Element')
      .replace(/Array<(?:'[^']+'\s*\|\s*){7,}'[^']+'>/g, 'string[]');
    const tail = rawSig
      .slice(splitIdx)
      .replaceAll(`Promise<${ACTION_RESULT_RAW_TS}>`, 'Promise<ActionResult>')
      .replaceAll(SNAPSHOT_NODE_RAW_TS, 'SnapshotNode')
      .replaceAll(`pagination?: ${PAGINATION_TS}`, 'pagination?: Pagination')
      .replaceAll(
        `matchedStyles: ${CSS_STYLES_RAW_TS}`,
        'matchedStyles: { element: { uid: string; selector: string }; rules: CssRule[] }',
      )
      .replaceAll(NET_DETAILED_TS, `NetReq & ${netDetailExtraTs}`)
      .replaceAll(`Array<${NET_CONCISE_TS}>`, 'NetReq[]')
      .replaceAll(`${NET_CONCISE_TS}[]`, 'NetReq[]')
      .replaceAll(
        `Array<${CONSOLE_CONCISE_TS} | ${ISSUE_CONCISE_TS}>`,
        'Array<ConsoleMsg | IssueMsg>',
      )
      .replaceAll(
        `${CONSOLE_DETAILED_TS} | ${ISSUE_DETAILED_TS}`,
        `(ConsoleMsg & { args: string[] }) | (IssueMsg & ${issueDetailExtraTs})`,
      );
    methodLines.push(compactTsWhitespace(`${head}${tail}`));
  }

  methodLines.push(
    'getElement(uid: string): Promise<Element|null>;',
    compactTsWhitespace(
      'getEventListeners(target: { element?: Element; uid?: string }): Promise<Array<{ type: string; useCapture: boolean; passive: boolean; once: boolean; lineNumber: number; columnNumber: number }>>;',
    ),
  );

  const consoleHelpers = [
    'declare function $(selector: string, startNode?: Node): Element|null;',
    'declare function $$(selector: string, startNode?: Node): Element[];',
    'declare function $x(xpath: string, startNode?: Node): Node[];',
    'declare function getAccessibleName(node: Node): string;',
    'declare function getAccessibleRole(node: Node): string;',
    'declare function monitorEvents(object: EventTarget, events?: string|string[]): void;',
    'declare function unmonitorEvents(object: EventTarget, events?: string|string[]): void;',
  ];

  return [
    ...typeAliases,
    'interface McpTools {',
    ...methodLines.map(line => `  ${line}`),
    '}',
    ...consoleHelpers,
  ].join('\n');
}
