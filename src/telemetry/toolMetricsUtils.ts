/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ToolDefinition} from '../tools/ToolDefinition.js';

import {
  transformArgName,
  transformArgType,
  getZodType,
  PARAM_BLOCKLIST,
} from './ClearcutLogger.js';

/**
 * Validates that all values in an enum are of the homogeneous primitive type.
 * Returns the primitive type string. Throws an error if heterogeneous.
 */
export function validateEnumHomogeneity(values: unknown[]): string {
  const firstType = typeof values[0];
  for (const val of values) {
    if (typeof val !== firstType) {
      throw new Error('Heterogeneous enum types found');
    }
  }
  return firstType;
}

export interface ArgMetric {
  name: string;
  argType: string;
}

export interface ToolMetric {
  name: string;
  args: ArgMetric[];
}

/**
 * Generates tool metrics from tool definitions.
 */
export function generateToolMetrics(tools: ToolDefinition[]): ToolMetric[] {
  return tools.map(tool => {
    const args: ArgMetric[] = [];

    for (const [name, schema] of Object.entries(tool.schema)) {
      if (PARAM_BLOCKLIST.has(name)) {
        continue;
      }
      const zodType = getZodType(schema);
      const transformedName = transformArgName(zodType, name);
      let argType = transformArgType(zodType);

      if (argType === 'enum') {
        let values;
        if (schema._def.values?.length > 0) {
          values = schema._def.values;
        } else {
          values = schema._def.innerType._def.values;
        }
        argType = validateEnumHomogeneity(values);
      }

      args.push({
        name: transformedName,
        argType,
      });
    }

    return {
      name: tool.name,
      args,
    };
  });
}
