/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {parseArgs} from 'node:util';

import type {ArgDef, Commands} from './cli-options.js';
import {isOptionalPositionalArg} from './cli-commands.js';
import type {CliOption} from './types.js';

export function toCamelCase(str: string): string {
  return str.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
}

export function stripQuotes(val: string): string {
  if (
    val.length >= 2 &&
    ((val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"')))
  ) {
    return val.slice(1, -1);
  }
  return val;
}

export interface ParsedCliCommand {
  command: string;
  sessionId: string;
  help?: boolean;
  toolArgs?: Record<string, unknown>;
  outputFormat?: 'md' | 'json';
  serverArgs?: Record<string, unknown>;
}

export class CliParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliParseError';
  }
}

export function formatCliTip(msg: string): string {
  let output = `Error: ${msg}`;
  if (
    msg.includes('Not enough non-option arguments') ||
    msg.includes('Unknown argument') ||
    msg.includes('Unknown arguments')
  ) {
    output += '\n\n=========================================';
    output += '\n💡 TIP FOR AI AGENT / DEVELOPER:';
    output += '\nIn the `chrome-devtools` CLI:';
    output +=
      '\n1. Required parameters MUST be passed as positional arguments (without flags).';
    output += '\n   - INCORRECT: chrome-devtools click --pageId 1 --uid "1_2"';
    output += '\n   - CORRECT:   chrome-devtools click 1 "1_2"';
    output +=
      '\n   - CORRECT:   chrome-devtools evaluate_script "() => document.title" --pageId 1';
    output +=
      '\n2. Optional parameters are passed as double-dash options/flags (e.g. --dblClick true), except optional positional parameters shown in command help.';
    output +=
      '\n3. Make sure to escape quotes properly for your shell environment.';
    output +=
      '\nRun `chrome-devtools <command> --help` to see exact positional and optional parameters.';
    output += '\n=========================================';
  }
  return output;
}

export function parseOptionTokens(
  args: string[],
  options: Record<string, CliOption>,
): Record<string, unknown> {
  const {tokens} = parseArgs({
    args,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  const canonicalMap = new Map<string, string>();
  for (const [key, opt] of Object.entries(options)) {
    canonicalMap.set(key, key);
    canonicalMap.set(toCamelCase(key), key);
    if (opt.alias) {
      canonicalMap.set(opt.alias, key);
      canonicalMap.set(toCamelCase(opt.alias), key);
    }
  }

  const result: Record<string, unknown> = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === 'option-terminator') {
      break;
    }
    if (token.kind === 'positional') {
      continue;
    }

    if (token.rawName.startsWith('--no-')) {
      const rawWithoutNo = token.rawName.slice(5);
      const normalizedWithoutNo = toCamelCase(rawWithoutNo);
      const canonical =
        canonicalMap.get(normalizedWithoutNo) ??
        canonicalMap.get(rawWithoutNo) ??
        normalizedWithoutNo;
      result[canonical] = false;
      continue;
    }

    const normalizedName = toCamelCase(token.name);
    const canonical =
      canonicalMap.get(normalizedName) ??
      canonicalMap.get(token.name) ??
      normalizedName;
    const opt = options[canonical];

    if (!opt) {
      if (token.inlineValue) {
        result[canonical] = stripQuotes(token.value ?? '');
      } else {
        const next = tokens[i + 1];
        if (
          next &&
          next.kind === 'positional' &&
          (next.value === 'true' || next.value === 'false')
        ) {
          i++;
          result[canonical] = next.value === 'true';
        } else {
          result[canonical] = true;
        }
      }
      continue;
    }

    if (opt.type === 'boolean') {
      if (token.inlineValue) {
        result[canonical] = stripQuotes(token.value ?? '') === 'true';
      } else {
        const next = tokens[i + 1];
        if (
          next &&
          next.kind === 'positional' &&
          (next.value === 'true' || next.value === 'false')
        ) {
          i++;
          result[canonical] = next.value === 'true';
        } else {
          result[canonical] = true;
        }
      }
    } else if (opt.type === 'string') {
      if (token.inlineValue) {
        result[canonical] = stripQuotes(token.value ?? '');
      } else {
        const next = tokens[i + 1];
        if (next && next.kind === 'positional') {
          i++;
          result[canonical] = stripQuotes(next.value);
        } else {
          result[canonical] = '';
        }
      }
    } else if (opt.type === 'number') {
      if (token.inlineValue) {
        result[canonical] = Number(stripQuotes(token.value ?? ''));
      } else {
        const next = tokens[i + 1];
        if (next && next.kind === 'positional') {
          i++;
          result[canonical] = Number(stripQuotes(next.value));
        } else {
          result[canonical] = NaN;
        }
      }
    } else if (opt.type === 'array') {
      let arr: string[];
      const existing = result[canonical];
      if (Array.isArray(existing)) {
        arr = existing;
      } else {
        arr = [];
        result[canonical] = arr;
      }
      if (token.inlineValue) {
        arr.push(stripQuotes(token.value ?? ''));
      } else {
        while (tokens[i + 1] && tokens[i + 1].kind === 'positional') {
          i++;
          const nextTok = tokens[i];
          if (nextTok.kind === 'positional') {
            arr.push(stripQuotes(nextTok.value));
          }
        }
      }
    }
  }

  for (const [key, opt] of Object.entries(options)) {
    const val = result[key];
    if (val !== undefined) {
      if (opt.choices) {
        let match = false;
        for (const choice of opt.choices) {
          if (choice === val) {
            match = true;
            break;
          }
        }
        if (!match) {
          throw new CliParseError(
            `Invalid value for --${key}: "${String(val)}". Allowed choices: ${opt.choices.join(', ')}`,
          );
        }
      }
      if (
        opt.type === 'string' &&
        'coerce' in opt &&
        typeof opt.coerce === 'function'
      ) {
        result[key] = opt.coerce(typeof val === 'string' ? val : undefined);
      } else if (
        opt.type === 'number' &&
        'coerce' in opt &&
        typeof opt.coerce === 'function'
      ) {
        result[key] = opt.coerce(typeof val === 'number' ? val : undefined);
      } else if (
        opt.type === 'array' &&
        'coerce' in opt &&
        typeof opt.coerce === 'function'
      ) {
        result[key] = opt.coerce(Array.isArray(val) ? val : undefined);
      }
    }
  }

  return result;
}

function validateEnumChoice(argName: string, val: unknown, choices?: ReadonlyArray<string | number>): void {
  if (!choices) {
    return;
  }
  let match = false;
  for (const choice of choices) {
    if (choice === val) {
      match = true;
      break;
    }
  }
  if (!match) {
    throw new CliParseError(
      `Invalid value for ${argName}: "${String(val)}". Allowed choices: ${choices.join(', ')}`,
    );
  }
}

export function parseCliCommand(
  rawArgs: string[],
  commandsDef: Commands,
  getCliOpts: () => Record<string, CliOption>,
): ParsedCliCommand {
  const {tokens} = parseArgs({
    args: rawArgs,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  let sessionId = process.env.CD4A_INTERNAL_DAEMON_SESSION_ID || '';
  let commandTokenIndex = -1;
  const skippedIndices = new Set<number>();
  let hasHelp = false;
  let hasVersion = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === 'option-terminator') {
      break;
    }
    if (tok.kind === 'option') {
      if (tok.name === 'help' || tok.name === 'h') {
        hasHelp = true;
        skippedIndices.add(i);
        continue;
      }
      if (tok.name === 'version' || tok.name === 'v') {
        hasVersion = true;
        skippedIndices.add(i);
        continue;
      }
      if (tok.name === 'sessionId' || toCamelCase(tok.name) === 'sessionId') {
        skippedIndices.add(i);
        if (tok.inlineValue) {
          sessionId = stripQuotes(tok.value ?? '');
        } else {
          const next = tokens[i + 1];
          if (next && next.kind === 'positional') {
            i++;
            skippedIndices.add(i);
            sessionId = stripQuotes(next.value);
          }
        }
        continue;
      }
    } else if (tok.kind === 'positional' && commandTokenIndex === -1) {
      commandTokenIndex = i;
      skippedIndices.add(i);
    }
  }

  if (hasVersion && commandTokenIndex === -1) {
    return {command: 'version', sessionId};
  }

  if (commandTokenIndex === -1) {
    if (hasHelp) {
      return {command: 'help', sessionId, help: true};
    }
    throw new CliParseError(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  }

  const commandTok = tokens[commandTokenIndex];
  if (!commandTok || commandTok.kind !== 'positional') {
    throw new CliParseError(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  }
  const commandName = commandTok.value;

  if (
    commandName !== 'start' &&
    commandName !== 'status' &&
    commandName !== 'stop' &&
    !(commandName in commandsDef)
  ) {
    throw new CliParseError(`Unknown argument: ${commandName}`);
  }

  if (hasHelp) {
    return {command: commandName, sessionId, help: true};
  }

  const remainingTokens = tokens.filter((_, idx) => !skippedIndices.has(idx));

  if (commandName === 'start') {
    const cliOptions = getCliOpts();
    const argsToParse: string[] = [];
    for (let i = 0; i < remainingTokens.length; i++) {
      const tok = remainingTokens[i];
      if (tok.kind === 'option-terminator') {
        throw new CliParseError('Unknown argument: --');
      }
      if (tok.kind === 'positional') {
        throw new CliParseError(`Unknown argument: ${tok.value}`);
      }
      if (tok.kind === 'option') {
        argsToParse.push(tok.rawName);
        if (tok.inlineValue) {
          argsToParse[argsToParse.length - 1] += `=${tok.value ?? ''}`;
        } else {
          const next = remainingTokens[i + 1];
          if (next && next.kind === 'positional') {
            i++;
            argsToParse.push(next.value);
          }
        }
      }
    }

    const serverArgs = parseOptionTokens(argsToParse, cliOptions);
    const allowed = new Set(Object.keys(cliOptions));
    for (const key of Object.keys(serverArgs)) {
      if (!allowed.has(key)) {
        throw new CliParseError(`Unknown argument: ${key}`);
      }
    }
    return {command: 'start', sessionId, serverArgs};
  }

  if (commandName === 'status' || commandName === 'stop') {
    for (const tok of remainingTokens) {
      if (tok.kind === 'positional') {
        throw new CliParseError(`Unknown argument: ${tok.value}`);
      }
      if (tok.kind === 'option') {
        throw new CliParseError(`Unknown argument: ${tok.rawName}`);
      }
    }
    return {command: commandName, sessionId};
  }

  const cmdDef = commandsDef[commandName];
  const positionalDefs: ArgDef[] = [];
  const flagDefs: Record<string, ArgDef> = {};

  for (const [argName, arg] of Object.entries(cmdDef.args)) {
    if (arg.required || isOptionalPositionalArg(commandName, argName)) {
      positionalDefs.push(arg);
    } else {
      flagDefs[argName] = arg;
    }
  }

  flagDefs['output-format'] = {
    name: 'output-format',
    type: 'string',
    description: 'Output format',
    required: false,
    default: 'md',
    enum: ['md', 'json'],
  };

  const flagMap = new Map<string, ArgDef>();
  for (const [key, def] of Object.entries(flagDefs)) {
    flagMap.set(key, def);
    flagMap.set(toCamelCase(key), def);
    flagMap.set(
      key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`),
      def,
    );
  }

  const positionalValues: string[] = [];
  const toolArgs: Record<string, unknown> = {};

  let pastOptionTerminator = false;
  for (let i = 0; i < tokens.length; i++) {
    if (skippedIndices.has(i)) {
      continue;
    }
    const tok = tokens[i];
    if (tok.kind === 'option-terminator') {
      pastOptionTerminator = true;
      continue;
    }

    if (pastOptionTerminator) {
      if (tok.kind === 'positional') {
        positionalValues.push(stripQuotes(tok.value));
      } else if (tok.kind === 'option') {
        positionalValues.push(stripQuotes(tok.rawName));
      }
      continue;
    }

    if (tok.kind === 'positional') {
      positionalValues.push(stripQuotes(tok.value));
      continue;
    }

    if (tok.kind === 'option') {
      if (tok.rawName.startsWith('--no-')) {
        const rawWithoutNo = tok.rawName.slice(5);
        const norm = toCamelCase(rawWithoutNo);
        const def = flagMap.get(norm) ?? flagMap.get(rawWithoutNo);
        if (!def || def.type !== 'boolean') {
          throw new CliParseError(`Unknown argument: ${tok.rawName}`);
        }
        toolArgs[def.name] = false;
        continue;
      }

      const norm = toCamelCase(tok.name);
      const def = flagMap.get(norm) ?? flagMap.get(tok.name);
      if (!def) {
        throw new CliParseError(`Unknown argument: ${tok.rawName}`);
      }

      if (def.type === 'boolean') {
        if (tok.inlineValue) {
          toolArgs[def.name] = stripQuotes(tok.value ?? '') === 'true';
        } else {
          const next = tokens[i + 1];
          if (
            next &&
            next.kind === 'positional' &&
            (next.value === 'true' || next.value === 'false')
          ) {
            i++;
            toolArgs[def.name] = next.value === 'true';
          } else {
            toolArgs[def.name] = true;
          }
        }
      } else if (def.type === 'integer' || def.type === 'number') {
        if (tok.inlineValue) {
          toolArgs[def.name] = Number(stripQuotes(tok.value ?? ''));
        } else {
          const next = tokens[i + 1];
          if (next && next.kind === 'positional') {
            i++;
            toolArgs[def.name] = Number(stripQuotes(next.value));
          } else {
            toolArgs[def.name] = NaN;
          }
        }
      } else if (def.type === 'array') {
        let arr: string[];
        const existing = toolArgs[def.name];
        if (Array.isArray(existing)) {
          arr = existing;
        } else {
          arr = [];
          toolArgs[def.name] = arr;
        }
        if (tok.inlineValue) {
          arr.push(stripQuotes(tok.value ?? ''));
        } else {
          while (tokens[i + 1] && tokens[i + 1].kind === 'positional') {
            i++;
            const nextTok = tokens[i];
            if (nextTok.kind === 'positional') {
              arr.push(stripQuotes(nextTok.value));
            }
          }
        }
      } else {
        if (tok.inlineValue) {
          toolArgs[def.name] = stripQuotes(tok.value ?? '');
        } else {
          const next = tokens[i + 1];
          if (next && next.kind === 'positional') {
            i++;
            toolArgs[def.name] = stripQuotes(next.value);
          } else {
            toolArgs[def.name] = '';
          }
        }
      }
      validateEnumChoice(`--${def.name}`, toolArgs[def.name], def.enum);
    }
  }

  const requiredCount = positionalDefs.filter(d => d.required).length;
  if (positionalValues.length < requiredCount) {
    throw new CliParseError(
      `Not enough non-option arguments: got ${positionalValues.length}, need at least ${requiredCount}`,
    );
  }

  const hasVariadic =
    positionalDefs.length > 0 &&
    positionalDefs[positionalDefs.length - 1].type === 'array';
  if (!hasVariadic && positionalValues.length > positionalDefs.length) {
    throw new CliParseError(
      `Unknown argument: ${positionalValues[positionalDefs.length]}`,
    );
  }

  for (let p = 0; p < positionalDefs.length; p++) {
    const def = positionalDefs[p];
    if (p >= positionalValues.length) {
      if (def.default !== undefined) {
        toolArgs[def.name] = def.default;
      }
      continue;
    }

    if (def.type === 'array') {
      const arr = positionalValues.slice(p);
      toolArgs[def.name] = arr;
      break;
    }

    if (def.type === 'integer' || def.type === 'number') {
      toolArgs[def.name] = Number(positionalValues[p]);
    } else if (def.type === 'boolean') {
      toolArgs[def.name] = positionalValues[p] === 'true';
    } else {
      toolArgs[def.name] = positionalValues[p];
    }
    validateEnumChoice(def.name, toolArgs[def.name], def.enum);
  }

  for (const def of Object.values(flagDefs)) {
    if (!(def.name in toolArgs) && def.default !== undefined) {
      toolArgs[def.name] = def.default;
    }
  }

  const outputFormatVal = toolArgs['output-format'];
  const outputFormat = outputFormatVal === 'json' ? 'json' : 'md';
  delete toolArgs['output-format'];

  return {
    command: commandName,
    sessionId,
    toolArgs,
    outputFormat,
  };
}
