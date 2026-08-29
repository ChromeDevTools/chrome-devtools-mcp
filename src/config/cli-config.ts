/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {serializeArgs} from '../daemon/utils.js';
import {yargs} from '../third_party/index.js';

import {getMcpOptionsForViaCli, mcpOptions} from './mcp-options.js';

export function getCliConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir(),
): string {
  const configHome =
    env['XDG_CONFIG_HOME'] || path.join(homeDirectory, '.config');
  return path.join(configHome, 'chrome-devtools', 'config.json');
}

export function readCliConfig(
  configPath = getCliConfigPath(),
): Record<string, unknown> {
  let contents: string;
  try {
    contents = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return {};
    }
    throw new Error(
      `Failed to read Chrome DevTools CLI config at ${configPath}: ${getErrorMessage(error)}`,
      {cause: error},
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `Failed to parse Chrome DevTools CLI config at ${configPath}: ${getErrorMessage(error)}`,
      {cause: error},
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      `Chrome DevTools CLI config at ${configPath} must contain a JSON object`,
    );
  }
  return parsed;
}

export function getCliStartOptions(): Partial<typeof mcpOptions> {
  const options: Partial<typeof mcpOptions> = {
    ...getMcpOptionsForViaCli(),
  };

  // Missing CLI serialization.
  delete options.viewport;

  // Change the defaults for the CLI.
  delete options.experimentalStructuredContent;
  delete options.experimentalInteropTools;

  return options;
}

export function applyCliStartDefaults(argv: {
  isolated?: unknown;
  userDataDir?: unknown;
  autoConnect?: unknown;
  browserUrl?: unknown;
  wsEndpoint?: unknown;
  headless?: unknown;
}): void {
  // Defaults but we do not want to affect the yargs conflict resolution.
  if (
    argv.isolated === undefined &&
    argv.userDataDir === undefined &&
    !argv.autoConnect &&
    !argv.browserUrl &&
    !argv.wsEndpoint
  ) {
    argv.isolated = true;
  }
  if (
    argv.headless === undefined &&
    !argv.autoConnect &&
    !argv.browserUrl &&
    !argv.wsEndpoint
  ) {
    argv.headless = true;
  }
}

export function parseCliStartArgv(
  argv: string[] = [],
  config: Record<string, unknown> = {},
) {
  const parsed = yargs(argv)
    .locale('en')
    .scriptName('chrome-devtools')
    .options(getCliStartOptions())
    .config(config)
    .strict()
    .exitProcess(false)
    .fail((message, error) => {
      throw error ?? new Error(message);
    })
    .parseSync();
  applyCliStartDefaults(parsed);
  return parsed;
}

export function resolveCliStartArgs(
  argv: string[] = [],
  config: Record<string, unknown> = {},
): string[] {
  return serializeArgs(mcpOptions, parseCliStartArgv(argv, config));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
