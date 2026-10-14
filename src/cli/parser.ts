/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {parseArgs, type ParseArgsConfig} from 'node:util';

import type {ArgDef} from '../config/cli-options.js';
import {assertValidSessionId} from '../daemon/utils.js';

const OPTIONAL_POSITIONAL_ARGS = new Set(['evaluate_script:function']);

export function isOptionalPositionalArg(
  commandName: string,
  argName: string,
): boolean {
  return OPTIONAL_POSITIONAL_ARGS.has(`${commandName}:${argName}`);
}

export function isPositionalArg(
  commandName: string,
  argName: string,
  arg: ArgDef,
): boolean {
  return arg.required || isOptionalPositionalArg(commandName, argName);
}

export const OUTPUT_FORMATS = ['md', 'json'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * An error caused by invalid CLI input. `showTip` requests the usage tip
 * explaining positional vs. flag arguments.
 */
export class CliUsageError extends Error {
  constructor(
    message: string,
    readonly showTip = false,
  ) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export interface GlobalArgs {
  command: string | undefined;
  /** Arguments without the command token and the global options. */
  rest: string[];
  sessionId: string;
  help: boolean;
  version: boolean;
}

/**
 * First pass over argv: extracts the command name and the global options
 * (`--sessionId`, `--help`, `--version`). Everything else is returned verbatim
 * so that `start` can forward it to the daemon unchanged.
 */
export function parseGlobalArgs(
  argv: string[],
  defaultSessionId = '',
): GlobalArgs {
  const result: GlobalArgs = {
    command: undefined,
    rest: [],
    sessionId: defaultSessionId,
    help: false,
    version: false,
  };
  let i = 0;
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      break;
    }
    if (arg === '--sessionId') {
      i++;
      if (i >= argv.length) {
        throw new CliUsageError(
          `Option '--sessionId <value>' argument missing`,
        );
      }
      result.sessionId = argv[i];
    } else if (arg.startsWith('--sessionId=')) {
      result.sessionId = arg.slice('--sessionId='.length);
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    } else if (result.command === undefined && !arg.startsWith('-')) {
      result.command = arg;
    } else {
      result.rest.push(arg);
    }
  }
  result.rest.push(...argv.slice(i));
  try {
    assertValidSessionId(result.sessionId);
  } catch (error) {
    throw new CliUsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  return result;
}

/**
 * Rewrites `--flag true|false` and `--flag=true|false` for known boolean flags
 * into `--flag` / `--no-flag`, which is what `parseArgs` understands. Stops at
 * the `--` terminator.
 */
export function normalizeBooleanFlags(
  args: string[],
  booleanNames: ReadonlySet<string>,
): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      result.push(...args.slice(i));
      break;
    }
    if (!arg.startsWith('--')) {
      result.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!booleanNames.has(name)) {
      result.push(arg);
      continue;
    }
    let value: string | undefined;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else if (args[i + 1] === 'true' || args[i + 1] === 'false') {
      value = args[i + 1];
      i++;
    }
    if (value === undefined || value === 'true') {
      result.push(`--${name}`);
    } else if (value === 'false') {
      result.push(`--no-${name}`);
    } else {
      throw new CliUsageError(
        `Invalid value for ${name}: expected true or false, got "${value}"`,
      );
    }
  }
  return result;
}

export interface ToolCommandDef {
  name: string;
  args: Record<string, ArgDef>;
}

export interface ParsedToolArgs {
  args: Record<string, unknown>;
  outputFormat: OutputFormat;
}

type ParseArgsOptions = NonNullable<ParseArgsConfig['options']>;

function toParseArgsOptions(
  command: ToolCommandDef,
): ParseArgsOptions & {booleanNames: Set<string>} {
  const options: ParseArgsOptions = {
    'output-format': {type: 'string', default: 'md'},
  };
  const booleanNames = new Set<string>();
  for (const [name, arg] of Object.entries(command.args)) {
    if (isPositionalArg(command.name, name, arg)) {
      continue;
    }
    if (arg.type === 'boolean') {
      options[name] = {type: 'boolean'};
      booleanNames.add(name);
    } else if (arg.type === 'array') {
      options[name] = {type: 'string', multiple: true};
    } else {
      options[name] = {type: 'string'};
    }
  }
  return Object.assign(options, {booleanNames});
}

function coerceScalar(name: string, arg: ArgDef, value: string): unknown {
  let result: string | number = value;
  if (arg.type === 'number' || arg.type === 'integer') {
    if (value.trim() === '' || Number.isNaN(Number(value))) {
      throw new CliUsageError(
        `Invalid value for ${name}: expected a number, got "${value}"`,
      );
    }
    result = Number(value);
    if (arg.type === 'integer' && !Number.isInteger(result)) {
      throw new CliUsageError(
        `Invalid value for ${name}: expected an integer, got "${value}"`,
      );
    }
  }
  if (arg.enum && !arg.enum.includes(result)) {
    throw new CliUsageError(
      `Invalid value for ${name}: expected one of ${arg.enum.map(String).join(', ')}, got "${value}"`,
    );
  }
  return result;
}

function coerce(name: string, arg: ArgDef, value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => coerceScalar(name, arg, String(item)));
  }
  return coerceScalar(name, arg, String(value));
}

/**
 * Parses the arguments of a generated tool command. Required args (and a few
 * whitelisted optional ones) are positional, the rest are `--flags`. Values are
 * coerced according to the tool schema.
 */
export function parseToolArgs(
  command: ToolCommandDef,
  args: string[],
): ParsedToolArgs {
  const {booleanNames, ...options} = toParseArgsOptions(command);
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: normalizeBooleanFlags(args, booleanNames),
      options,
      strict: true,
      allowPositionals: true,
      allowNegative: true,
    });
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }
    throw new CliUsageError(
      error instanceof Error ? error.message : String(error),
      /* showTip= */ true,
    );
  }

  const result: Record<string, unknown> = {};
  const positionals = [...parsed.positionals];
  const positionalDefs = Object.entries(command.args).filter(([name, arg]) =>
    isPositionalArg(command.name, name, arg),
  );
  const requiredCount = positionalDefs.filter(([, arg]) => arg.required).length;
  if (positionals.length < requiredCount) {
    throw new CliUsageError(
      `Not enough non-option arguments: got ${positionals.length}, need at least ${requiredCount}`,
      /* showTip= */ true,
    );
  }
  for (const [name, arg] of positionalDefs) {
    if (arg.type === 'array') {
      if (positionals.length > 0) {
        result[name] = coerce(name, arg, positionals.splice(0));
      }
      continue;
    }
    const value = positionals.shift();
    if (value !== undefined) {
      result[name] = coerce(name, arg, value);
    }
  }
  if (positionals.length > 0) {
    throw new CliUsageError(
      `Unknown arguments: ${positionals.join(', ')}`,
      /* showTip= */ true,
    );
  }

  for (const [name, arg] of Object.entries(command.args)) {
    if (isPositionalArg(command.name, name, arg)) {
      continue;
    }
    const value = parsed.values[name];
    if (value !== undefined) {
      result[name] = coerce(name, arg, value);
    }
  }
  for (const [name, arg] of Object.entries(command.args)) {
    if (result[name] === undefined && arg.default !== undefined) {
      result[name] = arg.default;
    }
  }

  const outputFormat = parsed.values['output-format'];
  if (
    typeof outputFormat !== 'string' ||
    !OUTPUT_FORMATS.some(format => format === outputFormat)
  ) {
    throw new CliUsageError(
      `Invalid value for output-format: expected one of ${OUTPUT_FORMATS.join(', ')}, got "${String(outputFormat)}"`,
    );
  }
  return {
    args: result,
    outputFormat: outputFormat === 'json' ? 'json' : 'md',
  };
}

/**
 * Rejects any leftover arguments for commands that take none (`status`, `stop`).
 */
export function assertNoArgs(command: string, args: string[]): void {
  if (args.length > 0) {
    throw new CliUsageError(
      `Unknown arguments for ${command}: ${args.join(', ')}`,
      /* showTip= */ true,
    );
  }
}
