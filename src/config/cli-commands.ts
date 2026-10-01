/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ArgDef} from './cli-options.js';

const OPTIONAL_POSITIONAL_ARGS = new Set(['evaluate_script:function']);

export function isOptionalPositionalArg(
  commandName: string,
  argName: string,
): boolean {
  return OPTIONAL_POSITIONAL_ARGS.has(`${commandName}:${argName}`);
}

/**
 * Builds the yargs command string and usage line for a CLI command.
 *
 * Optional flag args are rendered as `[--flag]` in the usage line only: as
 * part of the command string yargs parses each one as a trailing positional,
 * and a variadic positional has to be the last one. A small set of optional
 * args intentionally remain positional for backwards-compatible CLI syntax.
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
    } else if (isOptionalPositionalArg(commandName, name)) {
      command += arg.type === 'array' ? ` [${name}..]` : ` [${name}]`;
    } else {
      flags += ` [--${name}]`;
    }
  }

  return {command, usage: `$0 ${command}${flags}`};
}
