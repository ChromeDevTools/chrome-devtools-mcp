/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {zod, ShapeOutput} from '../third_party/index.js';

const LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function bucketizeLatency(latencyMs: number): number {
  for (const bucket of LATENCY_BUCKETS) {
    if (latencyMs <= bucket) {
      return bucket;
    }
  }
  return LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1];
}

export const PARAM_BLOCKLIST = new Set(['uid', 'reqid', 'msgid']);

const SUPPORTED_ZOD_TYPES = [
  'ZodString',
  'ZodNumber',
  'ZodBoolean',
  'ZodArray',
  'ZodEnum',
] as const;
type ZodType = (typeof SUPPORTED_ZOD_TYPES)[number];

function isZodType(type: string): type is ZodType {
  return SUPPORTED_ZOD_TYPES.includes(type as ZodType);
}

export function getZodType(zodType: zod.ZodTypeAny): ZodType {
  const def = zodType._def;
  const typeName = def.typeName;

  if (
    typeName === 'ZodOptional' ||
    typeName === 'ZodDefault' ||
    typeName === 'ZodNullable'
  ) {
    return getZodType(def.innerType);
  }
  if (typeName === 'ZodEffects') {
    return getZodType(def.schema);
  }

  if (isZodType(typeName)) {
    return typeName;
  }
  throw new Error(`Unsupported zod type for tool parameter: ${typeName}`);
}

export function stripUnderscoreBeforeNumber(name: string): string {
  return name.replace(/_([0-9])/g, '$1');
}

type LoggedToolCallArgValue = string | number | boolean;

export function transformArgName(zodType: ZodType, name: string): string {
  const snakeCaseName = name.replace(
    /[A-Z]/g,
    letter => `_${letter.toLowerCase()}`,
  );
  let transformed: string;
  if (zodType === 'ZodString') {
    transformed = `${snakeCaseName}_length`;
  } else if (zodType === 'ZodArray') {
    transformed = `${snakeCaseName}_count`;
  } else {
    transformed = snakeCaseName;
  }
  return stripUnderscoreBeforeNumber(transformed);
}

export function transformArgType(zodType: ZodType): string {
  if (zodType === 'ZodString' || zodType === 'ZodArray') {
    return 'number';
  }
  switch (zodType) {
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodEnum':
      return 'enum';
    default:
      throw new Error(`Unsupported zod type for tool parameter: ${zodType}`);
  }
}

const BUCKETS = [
  0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];

function bucketize(value: number): number {
  for (const bucket of BUCKETS) {
    if (bucket >= value) {
      return bucket;
    }
  }
  return BUCKETS[BUCKETS.length - 1];
}

function transformValue(
  zodType: ZodType,
  value: unknown,
): LoggedToolCallArgValue {
  if (zodType === 'ZodString') {
    return bucketize((value as string).length);
  } else if (zodType === 'ZodArray') {
    return (value as unknown[]).length;
  } else {
    return value as LoggedToolCallArgValue;
  }
}

function hasEquivalentType(zodType: ZodType, value: unknown): boolean {
  if (zodType === 'ZodString') {
    return typeof value === 'string';
  } else if (zodType === 'ZodArray') {
    return Array.isArray(value);
  } else if (zodType === 'ZodNumber') {
    return typeof value === 'number';
  } else if (zodType === 'ZodBoolean') {
    return typeof value === 'boolean';
  } else if (zodType === 'ZodEnum') {
    return (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    );
  } else {
    return false;
  }
}

export function sanitizeParams(
  params: ShapeOutput<zod.ZodRawShape>,
  schema: zod.ZodRawShape,
): ShapeOutput<zod.ZodRawShape> {
  const transformed: ShapeOutput<zod.ZodRawShape> = {};
  for (const [name, value] of Object.entries(params)) {
    if (PARAM_BLOCKLIST.has(name)) {
      continue;
    }
    const zodType = getZodType(schema[name]);
    if (!hasEquivalentType(zodType, value)) {
      throw new Error(
        `parameter ${name} has type ${zodType} but value ${value} is not of equivalent type`,
      );
    }
    const transformedName = transformArgName(zodType, name);
    const transformedValue = transformValue(zodType, value);
    transformed[transformedName] = transformedValue;
  }
  return transformed;
}
