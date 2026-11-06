/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { zod, ShapeOutput } from '../third_party/index.js';
import type { DevToolsData } from '../tools/ToolDefinition.js';
import type { ToolInvocationContext } from './types.js';
export declare function bucketizeLatency(latencyMs: number): number;
export declare const MAX_ACTIVE_DAYS = 31;
export declare function bucketizeDaysSince(days: number): number;
export declare const REDACTED_CLIENT_NAME = "<redacted>";
export declare function sanitizeClientName(clientName: string): string;
export declare const PARAM_BLOCKLIST: Set<string>;
declare const SUPPORTED_ZOD_TYPES: readonly ['ZodString', 'ZodNumber', 'ZodBoolean', 'ZodArray', 'ZodEnum'];
type ZodType = (typeof SUPPORTED_ZOD_TYPES)[number];
export declare function getZodType(zodType: unknown): ZodType;
/**
 * Resolves the values of an enum parameter, unwrapping any optional/default/
 * nullable/effects wrappers (in any order), mirroring {@link getZodType}.
 */
export declare function getEnumValues(zodType: unknown): unknown[];
export declare function stripUnderscoreBeforeNumber(name: string): string;
export declare function transformArgName(zodType: ZodType, name: string): string;
export declare function transformArgType(zodType: ZodType): string;
export declare function sanitizeParams(params: ShapeOutput<zod.ZodRawShape>, schema: zod.ZodRawShape): ShapeOutput<zod.ZodRawShape>;
export declare function buildContext(devToolsData?: DevToolsData, pageUrl?: string): ToolInvocationContext;
export {};
