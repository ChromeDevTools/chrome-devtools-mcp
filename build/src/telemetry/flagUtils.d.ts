/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { mcpOptions } from '../config/mcp-options.js';
import type { FlagUsage } from './types.js';
type CliOptions = typeof mcpOptions;
/**
 * Computes telemetry flag usage from parsed arguments and CLI options.
 *
 * Iterates over the defined CLI options to construct a payload:
 * - Flag names are converted to snake_case (e.g. `browserUrl` -> `browser_url`).
 * - A flag is logged as `{flag_name}_present` if:
 *    - It has no default value, OR
 *    - The provided value differs from the default value.
 * - Boolean flags are logged with their literal value.
 * - String flags with defined `choices` (Enums) are logged as their uppercase value.
 *
 * IMPORTANT: keep getPossibleFlagMetrics() in sync with this function.
 */
export declare function computeFlagUsage(args: Record<string, unknown>, options: CliOptions): FlagUsage;
export interface FlagMetric {
    name: string;
    flagType: 'boolean' | 'enum';
    choices?: string[];
}
/**
 * Computes the list of possible flag metrics based on the CLI options.
 *
 * IMPORTANT: keep this function in sync with computeFlagUsage().
 */
export declare function getPossibleFlagMetrics(options: CliOptions): FlagMetric[];
export {};
