/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

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
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
