/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolDefinition } from '../tools/ToolDefinition.js';
/**
 * Validates that all values in an enum are of the homogeneous primitive type.
 * Returns the primitive type string. Throws an error if heterogeneous.
 */
export declare function validateEnumHomogeneity(values: unknown[]): string;
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
export declare function applyToExistingMetrics(existing: ToolMetric[], update: ToolMetric[]): ToolMetric[];
export declare function applyToExisting<T extends {
    name: string;
    isDeprecated?: boolean;
}>(existing: T[], update: T[]): T[];
/**
 * Generates tool metrics from tool definitions.
 */
export declare function generateToolMetrics(tools: ToolDefinition[]): ToolMetric[];
