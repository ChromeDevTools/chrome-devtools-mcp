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
  isDeprecated?: boolean;
}

export interface ToolMetric {
  name: string;
  args: ArgMetric[];
  isDeprecated?: boolean;
}

export function applyToExistingMetrics(
  existing: ToolMetric[],
  update: ToolMetric[],
): ToolMetric[] {
  const updated = applyToExisting<ToolMetric>(existing, update);
  const existingByName = new Map(existing.map(tool => [tool.name, tool]));
  const updatedByName = new Map(update.map(tool => [tool.name, tool]));

  return updated.map(tool => {
    const existingTool = existingByName.get(tool.name);
    const updatedTool = updatedByName.get(tool.name);
    // If the tool still exists in the update, we will update the args.
    if (existingTool && updatedTool) {
      const updatedArgs = applyToExisting<ArgMetric>(
        existingTool.args,
        updatedTool.args,
      );
      return {...tool, args: updatedArgs};
    }
    return tool;
  });
}

function applyToExisting<T extends {name: string; isDeprecated?: boolean}>(
  existing: T[],
  update: T[],
): T[] {
  const existingNames = new Set(existing.map(item => item.name));
  const updatedNames = new Set(update.map(item => item.name));

  const result: T[] = [];
  // Keep the original ordering.
  for (const entry of existing) {
    const toAdd = {...entry};
    if (!updatedNames.has(entry.name)) {
      toAdd.isDeprecated = true;
    }
    result.push(toAdd);
  }
  // New entries must be added to the very back of the list.
  for (const entry of update) {
    if (!existingNames.has(entry.name)) {
      result.push({...entry});
    }
  }
  return result;
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
