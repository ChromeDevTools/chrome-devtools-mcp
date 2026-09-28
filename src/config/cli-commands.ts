/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import type {ArgDef} from './cli-options.js';

const FILE_URL_PROTOCOLS = new Set(['file:', 'http:', 'https:', 'ws:', 'wss:']);

function resolveFilePath(filePathOrUrl: string, cwd: string): string {
  if (path.isAbsolute(filePathOrUrl)) {
    return filePathOrUrl;
  }

  try {
    if (FILE_URL_PROTOCOLS.has(new URL(filePathOrUrl).protocol)) {
      return filePathOrUrl;
    }
  } catch {
    // Regular file paths are not valid URLs.
  }

  return path.resolve(cwd, filePathOrUrl);
}

function resolveFileArg(value: unknown, cwd: string): unknown {
  if (typeof value === 'string') {
    return resolveFilePath(value, cwd);
  }
  if (Array.isArray(value)) {
    return value.map(item =>
      typeof item === 'string' ? resolveFilePath(item, cwd) : item,
    );
  }
  return value;
}

/**
 * Builds the yargs command string and usage line for a CLI command.
 *
 * Optional args are rendered as `[--flag]` in the usage line only: as part of
 * the command string yargs parses each one as a trailing positional, and a
 * variadic positional has to be the last one.
 */
export function buildCommand(
  commandName: string,
  args: Record<string, ArgDef>,
): {command: string; usage: string} {
  let command = commandName;
  let flags = '';
  for (const [name, arg] of Object.entries(args)) {
    if (arg.required) {
      command += arg.type === 'array' ? ` <${name}..>` : ` <${name}>`;
    } else {
      flags += ` [--${name}]`;
    }
  }

  return {command, usage: `$0 ${command}${flags}`};
}

export function buildCommandArgs(
  args: Record<string, ArgDef>,
  argv: Record<string, unknown>,
  cwd = process.cwd(),
): Record<string, unknown> {
  const commandArgs: Record<string, unknown> = {};
  for (const [argName, arg] of Object.entries(args)) {
    if (argName in argv) {
      const value = argv[argName];
      commandArgs[argName] = arg.isFilePath
        ? resolveFileArg(value, cwd)
        : value;
    }
  }
  return commandArgs;
}
