/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ArgDef, Commands} from './cli-options.js';

const OPTIONAL_POSITIONAL_ARGS = new Set(['evaluate_script:function']);

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

export function isOptionalPositionalArg(
  commandName: string,
  argName: string,
): boolean {
  return OPTIONAL_POSITIONAL_ARGS.has(`${commandName}:${argName}`);
}

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

function getPositionalArgNames(
  commandName: string,
  args: Record<string, ArgDef>,
): string[] {
  return Object.entries(args)
    .filter(
      ([name, arg]) =>
        arg.required || isOptionalPositionalArg(commandName, name),
    )
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
      positionalNames = getPositionalArgNames(commandName, command.args);
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
    ([name, arg]) =>
      !arg.required &&
      !isOptionalPositionalArg(commandName, name) &&
      !setArgs.has(name),
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
 * and a variadic positional has to be the last one. A small set of optional
 * args intentionally remain positional for backwards-compatible CLI syntax.
 * Optional args supporting shorthands (see `expandShorthandArgs`) are
 * rendered as `[@uid]` or `[url]`.
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
      flags += formatOptionalArgUsage(commandName, name, arg);
    }
  }

  return {command, usage: `$0 ${command}${flags}`};
}
