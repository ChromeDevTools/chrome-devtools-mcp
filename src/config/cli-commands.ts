/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ArgDef, Commands} from './cli-options.js';

// Array args whose items are element uids.
const UID_ARRAY_ARGS = new Set(['evaluate_script:args']);

const URL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'file:',
  'chrome:',
  'chrome-extension:',
  'about:',
  'data:',
]);

const UID_PREFIX = '@';

function isUidArg(commandName: string, argName: string): boolean {
  return (
    argName === 'uid' ||
    argName.endsWith('_uid') ||
    UID_ARRAY_ARGS.has(`${commandName}:${argName}`)
  );
}

function isUrl(token: string): boolean {
  if (!URL.canParse(token)) {
    return false;
  }
  return URL_PROTOCOLS.has(new URL(token).protocol);
}

function stripUidPrefix(token: string): string {
  return token.startsWith(UID_PREFIX) ? token.slice(UID_PREFIX.length) : token;
}

function getPositionalArgNames(args: Record<string, ArgDef>): string[] {
  return Object.entries(args)
    .filter(([, arg]) => arg.positional)
    .map(([name]) => name);
}

function isFlag(token: string): boolean {
  return token.startsWith('-') && token.length > 1 && isNaN(Number(token));
}

/**
 * Expands CLI shorthands into regular yargs arguments:
 *
 * - `@<uid>` is accepted for uid params. In a positional slot the `@` is
 *   stripped. As an extra positional it fills the first optional uid param
 *   that is not set yet (e.g. `take_screenshot 1 @1_5` becomes
 *   `take_screenshot 1 --uid 1_5`), or is appended to a uid array param.
 * - An absolute URL passed as an extra positional fills an optional `url`
 *   param (e.g. `navigate_page 1 https://example.com`).
 *
 * Arguments of non-tool commands and tokens that do not match a shorthand are
 * returned unchanged so that yargs reports them as usual.
 */
export function expandShorthandArgs(
  argv: string[],
  commands: Commands,
): string[] {
  const result: string[] = [];
  const expanded: string[] = [];
  const setArgs = new Set<string>();
  let commandName: string | undefined;
  let positionalNames: string[] = [];
  let positionalIndex = 0;

  const getArg = (name: string): ArgDef | undefined =>
    commandName ? commands[commandName]?.args[name] : undefined;

  let i = 0;
  for (; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      break;
    }

    if (isFlag(token)) {
      result.push(token);
      const [rawName, inlineValue] = token.replace(/^-+/, '').split('=', 2);
      setArgs.add(rawName);
      if (inlineValue !== undefined) {
        continue;
      }
      const arg = getArg(rawName);
      const isUid = commandName ? isUidArg(commandName, rawName) : false;
      if (arg?.type === 'boolean') {
        const next = argv[i + 1];
        if (next === 'true' || next === 'false') {
          result.push(next);
          i++;
        }
      } else if (arg?.type === 'array') {
        while (i + 1 < argv.length && !isFlag(argv[i + 1])) {
          i++;
          result.push(isUid ? stripUidPrefix(argv[i]) : argv[i]);
        }
      } else if (i + 1 < argv.length && !isFlag(argv[i + 1])) {
        i++;
        result.push(isUid ? stripUidPrefix(argv[i]) : argv[i]);
      }
      continue;
    }

    if (!commandName) {
      const command = commands[token];
      if (!command) {
        return argv;
      }
      commandName = token;
      positionalNames = getPositionalArgNames(command.args);
      result.push(token);
      continue;
    }

    const positionalName = positionalNames[positionalIndex];
    if (positionalName !== undefined) {
      result.push(
        isUidArg(commandName, positionalName) ? stripUidPrefix(token) : token,
      );
      if (getArg(positionalName)?.type !== 'array') {
        positionalIndex++;
      }
      continue;
    }

    const target = findShorthandTarget(
      commandName,
      commands[commandName].args,
      token,
      setArgs,
    );
    if (target) {
      expanded.push(`--${target.name}`, target.value);
      if (target.single) {
        setArgs.add(target.name);
      }
      continue;
    }
    result.push(token);
  }

  return [...result, ...expanded, ...argv.slice(i)];
}

function findShorthandTarget(
  commandName: string,
  args: Record<string, ArgDef>,
  token: string,
  setArgs: Set<string>,
): {name: string; value: string; single: boolean} | undefined {
  const candidates = Object.entries(args).filter(
    ([name, arg]) => !arg.positional && !setArgs.has(name),
  );
  if (token.startsWith(UID_PREFIX) && token.length > UID_PREFIX.length) {
    for (const [name, arg] of candidates) {
      if (isUidArg(commandName, name)) {
        return {
          name,
          value: stripUidPrefix(token),
          single: arg.type !== 'array',
        };
      }
    }
    return undefined;
  }
  if (isUrl(token)) {
    for (const [name] of candidates) {
      if (name === 'url') {
        return {name, value: token, single: true};
      }
    }
  }
  return undefined;
}

function formatOptionalArgUsage(
  commandName: string,
  name: string,
  arg: ArgDef,
): string {
  if (isUidArg(commandName, name)) {
    return arg.type === 'array' ? ` [@${name}..]` : ` [@${name}]`;
  }
  if (name === 'url') {
    return ` [url]`;
  }
  return ` [--${name}]`;
}

/**
 * Builds the yargs command string and usage line for a CLI command.
 *
 * Optional flag args are rendered as `[--flag]` in the usage line only: as
 * part of the command string yargs parses each one as a trailing positional,
 * and a variadic positional has to be the last one. Which args are positional
 * is decided at build time by `scripts/generate-cli.ts`. Optional args
 * supporting shorthands (see `expandShorthandArgs`) are rendered as `[@uid]`
 * or `[url]`.
 */
export function buildCommand(
  commandName: string,
  args: Record<string, ArgDef>,
): {command: string; usage: string} {
  let command = commandName;
  let flags = '';
  for (const [name, arg] of Object.entries(args)) {
    if (!arg.positional) {
      flags += formatOptionalArgUsage(commandName, name, arg);
    } else if (arg.required) {
      command += arg.type === 'array' ? ` <${name}..>` : ` <${name}>`;
    } else {
      command += arg.type === 'array' ? ` [${name}..]` : ` [${name}]`;
    }
  }

  return {command, usage: `$0 ${command}${flags}`};
}

export type OptionKind = 'boolean' | 'array' | 'value';

/**
 * Options that are available on every tool command and are consumed by yargs
 * rather than forwarded to the tool.
 */
export const GLOBAL_CLI_OPTIONS: ReadonlyMap<string, OptionKind> = new Map([
  ['sessionId', 'value'],
  ['outputFormat', 'value'],
  ['help', 'boolean'],
  ['version', 'boolean'],
]);

/**
 * Describes what a CLI command accepts, as needed by `shieldLiteralArgs`.
 */
export interface CommandArgSpec {
  /** Known option names (camelCase and aliases) and how they take values. */
  options: Map<string, OptionKind>;
  /** Number of positional arguments. */
  positionalCount: number;
  /** Whether the last positional is variadic. */
  variadic: boolean;
}

/**
 * Builds a `CommandArgSpec` for a tool command from its generated arg
 * definitions and the options available on every command.
 */
export function getCommandArgSpec(
  args: Record<string, ArgDef>,
  globalOptions: ReadonlyMap<string, OptionKind> = GLOBAL_CLI_OPTIONS,
): CommandArgSpec {
  const options = new Map(globalOptions);
  let positionalCount = 0;
  let variadic = false;
  for (const [name, arg] of Object.entries(args)) {
    if (arg.positional) {
      positionalCount++;
      variadic = arg.type === 'array';
    } else {
      options.set(name, toOptionKind(arg.type));
    }
  }
  return {options, positionalCount, variadic};
}

export function toOptionKind(type: string | undefined): OptionKind {
  if (type === 'boolean') {
    return 'boolean';
  }
  if (type === 'array') {
    return 'array';
  }
  return 'value';
}

const LITERAL_ARG_PREFIX = '\0literal:';
// Mirrors yargs-parser's negative number detection.
const NEGATIVE_NUMBER = /^-\d+(\.\d*)?(e-?\d+)?$/;

function optionName(token: string): string {
  let name = token.replace(/^-+/, '');
  const eq = name.indexOf('=');
  if (eq !== -1) {
    name = name.slice(0, eq);
  }
  if (name.startsWith('no-')) {
    name = name.slice(3);
  }
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

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
 * Shielded tokens are replaced by opaque placeholders that `restore` maps back
 * to the original values. A token is shielded when:
 *
 * - it is a lone `-`, which can never be an option;
 * - it follows the first `--`, which is dropped so the tokens populate
 *   positionals;
 * - it starts with `-`, is not a known option of the command, and the command
 *   still has an unfilled positional. Known options and their values are
 *   skipped the way yargs consumes them, so a dash-prefixed value such as
 *   `--flag` in a positional slot is passed through as text, while an unknown
 *   flag after all positionals are filled is still rejected by yargs.
 *
 * `getSpec` resolves the spec of a command by name and returns `undefined`
 * for tokens that are not a command.
 */
export function shieldLiteralArgs(
  argv: readonly string[],
  getSpec: (commandName: string) => CommandArgSpec | undefined,
): {
  argv: string[];
  restore: (value: unknown) => unknown;
} {
  const literals = new Map<string, string>();
  const result: string[] = [];
  const shield = (token: string): void => {
    const placeholder = `${LITERAL_ARG_PREFIX}${literals.size}`;
    literals.set(placeholder, token);
    result.push(placeholder);
  };

  let spec: CommandArgSpec | undefined;
  let filled = 0;
  let afterDoubleDash = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (afterDoubleDash) {
      shield(token);
      continue;
    }
    if (token === '--') {
      afterDoubleDash = true;
      continue;
    }
    if (token === '-') {
      shield(token);
      filled++;
      continue;
    }
    if (!token.startsWith('-') || NEGATIVE_NUMBER.test(token)) {
      result.push(token);
      if (!spec) {
        spec = getSpec(token);
      } else {
        filled++;
      }
      continue;
    }

    const kind = spec?.options.get(optionName(token));
    if (kind !== undefined) {
      result.push(token);
      if (token.includes('=')) {
        continue;
      }
      if (kind === 'boolean') {
        if (/^(true|false)$/.test(argv[i + 1] ?? '')) {
          result.push(argv[++i]);
        }
      } else if (kind === 'array') {
        while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          result.push(argv[++i]);
        }
      } else if (i + 1 < argv.length) {
        result.push(argv[++i]);
      }
      continue;
    }

    const hasUnfilledPositional =
      spec !== undefined &&
      (filled < spec.positionalCount ||
        (spec.variadic && spec.positionalCount > 0));
    if (hasUnfilledPositional) {
      shield(token);
      filled++;
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
