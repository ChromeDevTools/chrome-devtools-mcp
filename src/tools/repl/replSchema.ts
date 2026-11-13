/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {StructuredCssStyles} from '../../formatters/CssFormatter.js';
import {zod} from '../../third_party/index.js';
import {isPlainRecord} from '../../utils/objects.js';

import type {AnyToolDefinition, ToolSchema} from '../ToolDefinition.js';
import {stripReplToolParams} from './replPartition.js';

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
  ok: zod.boolean().optional(),
  navigatedToUrl: zod.string().optional(),
  dialogHandled: zod.boolean().optional(),
  snapshot: snapshotNodeSchema.optional(),
};

export const typeTextOutputSchema: ToolSchema = {
  ok: zod.boolean().optional(),
  navigatedToUrl: zod.string().optional(),
  dialogHandled: zod.boolean().optional(),
};

export const waitForOutputSchema: ToolSchema = {
  ok: zod.boolean().optional(),
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
  return zod
    .object({
      ...ambientMcpResponseOutputSchema,
      ...outputSchema,
    })
    .strict();
}

function withRequiredOk(outputSchema: ToolSchema | undefined): ToolSchema {
  const merged: ToolSchema = {ok: zod.boolean()};
  if (outputSchema) {
    for (const [key, value] of Object.entries(outputSchema)) {
      if (key !== 'ok') {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function toInputJsonSchema(shape: ToolSchema): Record<string, unknown> {
  const root: unknown = zod.toJSONSchema(zod.object(shape), {
    io: 'input',
    unrepresentable: 'any',
  });
  return isPlainRecord(root) ? root : {};
}

function toOutputShapeJsonSchema(shape: ToolSchema): Record<string, unknown> {
  const root: unknown = zod.toJSONSchema(zod.object(shape), {
    unrepresentable: 'any',
  });
  return isPlainRecord(root) ? root : {};
}
/* eslint-enable @local/enforce-zod-schema */

export function formatZodOutputValidationError(
  toolName: string,
  error: zod.ZodError,
): string {
  const details = error.issues
    .map(
      issue =>
        `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
    )
    .join(', ');
  return `Invalid output for ${toolName} (outputSchema mismatch): ${details}`;
}

const VALID_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const REPL_TS_TYPE_KEY = 'x-repl-ts-type';

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

function extractJsonSchemaDefs(
  root: Record<string, unknown>,
): Record<string, unknown> {
  return isPlainRecord(root.$defs) ? root.$defs : {};
}

function mapPrimitiveTypeName(typeName: unknown): string {
  switch (typeName) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

function jsonSchemaNodeToTs(
  node: unknown,
  defs: Record<string, unknown>,
  seenRefs: ReadonlySet<string>,
): string {
  if (!isPlainRecord(node)) {
    return 'unknown';
  }

  const customTs = node[REPL_TS_TYPE_KEY];
  if (typeof customTs === 'string') {
    return customTs;
  }

  if (typeof node.$ref === 'string') {
    const prefix = '#/$defs/';
    if (node.$ref.startsWith(prefix)) {
      const defName = node.$ref.slice(prefix.length);
      if (seenRefs.has(defName)) {
        return 'Record<string, unknown>';
      }
      const target = defs[defName];
      if (isPlainRecord(target)) {
        const nextSeen = new Set(seenRefs);
        nextSeen.add(defName);
        return jsonSchemaNodeToTs(target, defs, nextSeen);
      }
    }
    return 'Record<string, unknown>';
  }

  if ('const' in node) {
    return formatLiteralValue(node.const);
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return node.enum.map(item => formatLiteralValue(item)).join(' | ');
  }

  const unionBranches = Array.isArray(node.anyOf)
    ? node.anyOf
    : Array.isArray(node.oneOf)
      ? node.oneOf
      : undefined;
  if (unionBranches && unionBranches.length > 0) {
    const parts: string[] = [];
    for (const branch of unionBranches) {
      const rendered = jsonSchemaNodeToTs(branch, defs, seenRefs);
      if (!parts.includes(rendered)) {
        parts.push(rendered);
      }
    }
    return parts.length > 0 ? parts.join(' | ') : 'unknown';
  }

  if (Array.isArray(node.type) && node.type.length > 0) {
    const parts: string[] = [];
    for (const entry of node.type) {
      const rendered =
        entry === 'array' || entry === 'object'
          ? jsonSchemaNodeToTs({...node, type: entry}, defs, seenRefs)
          : mapPrimitiveTypeName(entry);
      if (!parts.includes(rendered)) {
        parts.push(rendered);
      }
    }
    return parts.join(' | ');
  }

  switch (node.type) {
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
    case 'null':
      return mapPrimitiveTypeName(node.type);
    case 'array': {
      if (isPlainRecord(node.items)) {
        const elemTs = jsonSchemaNodeToTs(node.items, defs, seenRefs);
        return elemTs.includes(' | ') ? `Array<${elemTs}>` : `${elemTs}[]`;
      }
      return 'unknown[]';
    }
    case 'object': {
      if (isPlainRecord(node.properties)) {
        const entries = Object.entries(node.properties);
        if (entries.length === 0) {
          return '{}';
        }
        const requiredSet = new Set<string>(
          Array.isArray(node.required)
            ? node.required.filter((r): r is string => typeof r === 'string')
            : [],
        );
        const fields: string[] = [];
        for (const [key, propNode] of entries) {
          const optionalSuffix = requiredSet.has(key) ? '' : '?';
          const propTs = jsonSchemaNodeToTs(propNode, defs, seenRefs);
          fields.push(`${formatPropertyKey(key)}${optionalSuffix}: ${propTs}`);
        }
        return `{ ${fields.join('; ')} }`;
      }
      if ('additionalProperties' in node) {
        if (node.additionalProperties === false) {
          return '{}';
        }
        if (isPlainRecord(node.additionalProperties)) {
          const valTs = jsonSchemaNodeToTs(
            node.additionalProperties,
            defs,
            seenRefs,
          );
          return `Record<string, ${valTs}>`;
        }
        return 'Record<string, unknown>';
      }
      return '{}';
    }
    default:
      return 'unknown';
  }
}

function zodSchemaToTs(schema: zod.ZodType): string {
  const root: unknown = zod.toJSONSchema(schema, {unrepresentable: 'any'});
  if (!isPlainRecord(root)) {
    return 'unknown';
  }
  return jsonSchemaNodeToTs(root, extractJsonSchemaDefs(root), new Set());
}

function zodOutputShapeToTs(shape: ToolSchema): string {
  const root = toOutputShapeJsonSchema(shape);
  return jsonSchemaNodeToTs(root, extractJsonSchemaDefs(root), new Set());
}

export function zodShapeToTs(shape: ToolSchema): string {
  const root = toInputJsonSchema(shape);
  return jsonSchemaNodeToTs(root, extractJsonSchemaDefs(root), new Set());
}

function augmentObjectSchemaWithReplElements(
  objNode: Record<string, unknown>,
  options: {
    includeElementsArrayItem: boolean;
    collapseLargeStringEnums: boolean;
  },
): Record<string, unknown> {
  if (!isPlainRecord(objNode.properties)) {
    return objNode;
  }
  const props = objNode.properties;
  const reqSet = new Set<string>(
    Array.isArray(objNode.required)
      ? objNode.required.filter((r): r is string => typeof r === 'string')
      : [],
  );
  const nextProps: Record<string, unknown> = {};

  for (const [key, propVal] of Object.entries(props)) {
    let effectiveProp: unknown = propVal;
    if (
      options.collapseLargeStringEnums &&
      isPlainRecord(propVal) &&
      propVal.type === 'array' &&
      isPlainRecord(propVal.items) &&
      Array.isArray(propVal.items.enum) &&
      propVal.items.enum.length >= 8 &&
      propVal.items.enum.every(v => typeof v === 'string')
    ) {
      effectiveProp = {...propVal, items: {type: 'string'}};
    }

    if (
      options.includeElementsArrayItem &&
      key === 'elements' &&
      isPlainRecord(effectiveProp) &&
      effectiveProp.type === 'array' &&
      isPlainRecord(effectiveProp.items)
    ) {
      effectiveProp = {
        ...effectiveProp,
        items: augmentObjectSchemaWithReplElements(effectiveProp.items, {
          includeElementsArrayItem: false,
          collapseLargeStringEnums: options.collapseLargeStringEnums,
        }),
      };
    }

    nextProps[key] = effectiveProp;

    if (key === 'uid') {
      reqSet.delete('uid');
      if (!('element' in props)) {
        nextProps.element = {[REPL_TS_TYPE_KEY]: 'Element'};
      }
    } else if (key === 'from_uid') {
      reqSet.delete('from_uid');
      if (!('fromElement' in props)) {
        nextProps.fromElement = {[REPL_TS_TYPE_KEY]: 'Element'};
      }
    } else if (key === 'to_uid') {
      reqSet.delete('to_uid');
      if (!('toElement' in props)) {
        nextProps.toElement = {[REPL_TS_TYPE_KEY]: 'Element'};
      }
    }
  }

  return {
    ...objNode,
    properties: nextProps,
    required: [...reqSet],
  };
}

function formatReplToolMethodSignatureInternal(
  tool: AnyToolDefinition,
  options?: {collapseLargeStringEnums?: boolean},
): string {
  const inputSchema = stripReplToolParams(tool.schema, {stripPageId: true});
  let paramsPart = '';
  if (Object.keys(inputSchema).length > 0) {
    const rawRoot = toInputJsonSchema(inputSchema);
    const initialRequired = Array.isArray(rawRoot.required)
      ? rawRoot.required.filter((r): r is string => typeof r === 'string')
      : [];
    const allOptional = initialRequired.length === 0;
    const augmentedRoot = augmentObjectSchemaWithReplElements(rawRoot, {
      includeElementsArrayItem: tool.name === 'fill_form',
      collapseLargeStringEnums: options?.collapseLargeStringEnums ?? false,
    });
    const inputTs = jsonSchemaNodeToTs(
      augmentedRoot,
      extractJsonSchemaDefs(augmentedRoot),
      new Set(),
    );
    paramsPart = `params${allOptional ? '?' : ''}: ${inputTs}`;
  }

  const outputTs = zodOutputShapeToTs(withRequiredOk(tool.outputSchema));
  return `${tool.name}(${paramsPart}): Promise<${outputTs}>;`;
}

export function formatReplToolMethodSignature(tool: AnyToolDefinition): string {
  return formatReplToolMethodSignatureInternal(tool);
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
  const root: unknown = zod.toJSONSchema(cascadeRuleSchema, {
    unrepresentable: 'any',
  });
  if (!isPlainRecord(root)) {
    return 'string';
  }
  const defs = extractJsonSchemaDefs(root);
  const branches = Array.isArray(root.anyOf)
    ? root.anyOf
    : Array.isArray(root.oneOf)
      ? root.oneOf
      : [];
  const literals: string[] = [];
  for (const branch of branches) {
    if (
      isPlainRecord(branch) &&
      isPlainRecord(branch.properties) &&
      'type' in branch.properties
    ) {
      const typeTs = jsonSchemaNodeToTs(
        branch.properties.type,
        defs,
        new Set(),
      );
      for (const part of typeTs.split(' | ')) {
        if (!literals.includes(part)) {
          literals.push(part);
        }
      }
    }
  }
  return literals.length > 0 ? literals.join('|') : 'string';
}

const SNAPSHOT_NODE_RAW_TS = zodSchemaToTs(snapshotNodeSchema);
const PAGINATION_TS = zodSchemaToTs(paginationOutputObjectSchema);
const ACTION_RESULT_RAW_TS = zodOutputShapeToTs(
  withRequiredOk(actionOutputSchema),
);
const NET_CONCISE_TS = zodSchemaToTs(networkRequestConciseSchema);
const NET_DETAILED_TS = zodSchemaToTs(networkRequestDetailedSchema);
const CONSOLE_CONCISE_TS = zodSchemaToTs(consoleMessageConciseSchema);
const CONSOLE_DETAILED_TS = zodSchemaToTs(consoleMessageDetailedSchema);
const ISSUE_CONCISE_TS = zodSchemaToTs(issueConciseSchema);
const ISSUE_DETAILED_TS = zodSchemaToTs(issueDetailedSchema);
const CSS_PROP_TS = zodSchemaToTs(structuredCssPropertySchema);
const CSS_STYLES_RAW_TS = zodSchemaToTs(structuredCssStylesSchema);
const CSS_RULE_TYPES_TS = collectCascadeRuleTypeLiterals();

export function buildReplApiDeclaration(
  innerTools: readonly AnyToolDefinition[],
): string {
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
  const netDetailExtraTs = zodOutputShapeToTs(netDetailExtraFields)
    .replaceAll(`Array<${NET_CONCISE_TS}>`, 'NetReq[]')
    .replaceAll(`${NET_CONCISE_TS}[]`, 'NetReq[]');

  const issueDetailExtraFields: ToolSchema = {};
  for (const [k, v] of Object.entries(issueDetailedSchema.shape)) {
    if (!(k in issueConciseShape)) {
      issueDetailExtraFields[k] = v;
    }
  }
  const issueDetailExtraTs = zodOutputShapeToTs(issueDetailExtraFields);

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
    const rawSig = formatReplToolMethodSignatureInternal(tool, {
      collapseLargeStringEnums: true,
    });
    const splitIdx = rawSig.indexOf('): Promise<');
    if (splitIdx === -1) {
      methodLines.push(compactTsWhitespace(rawSig));
      continue;
    }
    const head = rawSig.slice(0, splitIdx);
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
