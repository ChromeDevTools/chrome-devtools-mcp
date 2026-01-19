/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {cliOptions} from '../cli.js';
import {toSnakeCase} from '../utils/string.js';

import type {FlagUsage} from './types.js';

type CliOptions = typeof cliOptions;

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
 */
export function computeFlagUsage(
  args: Record<string, unknown>,
  options: CliOptions,
): FlagUsage {
  const usage: FlagUsage = {};

  for (const [flagName, config] of Object.entries(options)) {
    const value = args[flagName];
    const snakeCaseName = toSnakeCase(flagName);

    // If there isn't a default value provided for the flag,
    // we're going to log whether it's present on the args user
    // provided or not. If there is a default value, we only log presence
    // if the value differs from the default, implying explicit user intent.
    if (!('default' in config) || value !== config.default) {
      usage[`${snakeCaseName}_present`] = value !== undefined && value !== null;
    }

    if (config.type === 'boolean' && typeof value === 'boolean') {
      // For boolean options, we're going to log the value directly.
      usage[snakeCaseName] = value;
    } else if (
      config.type === 'string' &&
      typeof value === 'string' &&
      'choices' in config &&
      config.choices
    ) {
      // For enums, log the value as uppercase
      // We're going to have an enum for such flags with choices represented
      // as an `enum` where the keys of the enum will map to the uppercase `choice`.
      usage[snakeCaseName] = `${snakeCaseName}_${value}`.toUpperCase();
    }
  }

  return usage;
}
