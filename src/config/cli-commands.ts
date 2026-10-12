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

const LITERAL_ARG_PREFIX = '\0literal:';

/**
 * Shields positional values that yargs cannot carry through its parsing.
 *
 * yargs re-parses command positionals as `--name value` pairs, and in that
 * pass yargs-parser treats any value starting with `-` (other than a negative
 * number) as the next flag, replacing the value with `''`. It also never fills
 * positionals from the tokens after `--`. See
 * https://github.com/yargs/yargs/issues/1312 and
 * https://github.com/yargs/yargs/issues/1821.
 *
 * A lone `-` can never be an option, so it is always shielded. Everything
 * after the first `--` is shielded as well and the `--` itself is dropped, so
 * that those tokens populate positionals. Shielded tokens are replaced by
 * opaque placeholders that `restore` maps back to the original values.
 */
export function shieldLiteralArgs(argv: readonly string[]): {
  argv: string[];
  restore: (value: unknown) => unknown;
} {
  const literals = new Map<string, string>();
  const result: string[] = [];
  let afterDoubleDash = false;
  for (const token of argv) {
    if (!afterDoubleDash && token === '--') {
      afterDoubleDash = true;
      continue;
    }
    if (afterDoubleDash || token === '-') {
      const placeholder = `${LITERAL_ARG_PREFIX}${literals.size}`;
      literals.set(placeholder, token);
      result.push(placeholder);
    } else {
      result.push(token);
    }
  }

  const restore = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return literals.get(value) ?? value;
    }
    if (Array.isArray(value)) {
      return value.map(restore);
    }
    return value;
  };

  return {argv: result, restore};
}
