/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ArgDef, Commands} from '../config/cli-options.js';
import type {YargsOptions} from '../third_party/index.js';

import {OUTPUT_FORMATS, isOptionalPositionalArg} from './parser.js';

const SCRIPT_NAME = 'chrome-devtools';
const MAX_WIDTH = 120;
const INDENT = '  ';
const COLUMN_GAP = 2;

export const BUILTIN_COMMANDS: Array<[string, string]> = [
  ['start', 'Start or restart chrome-devtools-mcp'],
  ['status', 'Checks if chrome-devtools-mcp is running'],
  ['stop', 'Stop chrome-devtools-mcp if any'],
];

/**
 * Builds the command signature: the command name followed by its positional
 * args. Required args (and a small set of optional args kept positional for
 * backwards compatibility) are positional.
 */
export function buildSignature(
  commandName: string,
  args: Record<string, ArgDef>,
): string {
  let signature = commandName;
  for (const [name, arg] of Object.entries(args)) {
    if (arg.required) {
      signature += arg.type === 'array' ? ` <${name}..>` : ` <${name}>`;
    } else if (isOptionalPositionalArg(commandName, name)) {
      signature += arg.type === 'array' ? ` [${name}..]` : ` [${name}]`;
    }
  }
  return signature;
}

/**
 * Builds the usage line for a CLI command: the signature followed by every
 * optional arg as `[--flag]`.
 */
export function buildUsage(
  commandName: string,
  args: Record<string, ArgDef>,
): string {
  let flags = '';
  for (const [name, arg] of Object.entries(args)) {
    if (!arg.required && !isOptionalPositionalArg(commandName, name)) {
      flags += ` [--${name}]`;
    }
  }
  return `${buildSignature(commandName, args)}${flags}`;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      if (line.length > 0 && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else {
        line = line.length > 0 ? `${line} ${word}` : word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function formatTable(rows: Array<[string, string]>): string {
  if (rows.length === 0) {
    return '';
  }
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  const descriptionWidth = Math.max(
    20,
    MAX_WIDTH - INDENT.length - labelWidth - COLUMN_GAP,
  );
  const lines: string[] = [];
  for (const [label, description] of rows) {
    const wrapped = wrap(description, descriptionWidth);
    lines.push(
      `${INDENT}${label.padEnd(labelWidth + COLUMN_GAP)}${wrapped[0] ?? ''}`,
    );
    for (const extra of wrapped.slice(1)) {
      lines.push(`${INDENT}${' '.repeat(labelWidth + COLUMN_GAP)}${extra}`);
    }
  }
  return lines.join('\n');
}

function describeArg(arg: ArgDef): string {
  const parts = [arg.description.trim()];
  const meta: string[] = [`[${arg.type}]`];
  if (arg.enum) {
    meta.push(
      `[choices: ${arg.enum.map(value => JSON.stringify(value)).join(', ')}]`,
    );
  }
  if (arg.default !== undefined) {
    meta.push(`[default: ${JSON.stringify(arg.default)}]`);
  }
  parts.push(meta.join(' '));
  return parts.filter(Boolean).join(' ');
}

export function formatRootHelp(commands: Commands): string {
  const rows: Array<[string, string]> = [...BUILTIN_COMMANDS];
  for (const [name, def] of Object.entries(commands)) {
    rows.push([buildSignature(name, def.args), def.description]);
  }
  return [
    `${SCRIPT_NAME} <command> [...args] --flags`,
    `Run '${SCRIPT_NAME} <command> --help' for help on the specific command.`,
    '',
    'Commands:',
    formatTable(rows),
    '',
    'Options:',
    formatTable([
      ['--help, -h', 'Show help [boolean]'],
      ['--version, -v', 'Show version number [boolean]'],
    ]),
  ].join('\n');
}

export function formatToolHelp(
  commandName: string,
  def: Commands[string],
): string {
  const positionals: Array<[string, string]> = [];
  const options: Array<[string, string]> = [];
  for (const [name, arg] of Object.entries(def.args)) {
    if (arg.required || isOptionalPositionalArg(commandName, name)) {
      positionals.push([name, describeArg(arg)]);
    } else {
      options.push([`--${name}`, describeArg(arg)]);
    }
  }
  options.push([
    '--output-format',
    `[choices: ${OUTPUT_FORMATS.map(format => JSON.stringify(format)).join(', ')}] [default: "md"]`,
  ]);
  options.push(['--help, -h', 'Show help [boolean]']);

  const sections = [
    `${SCRIPT_NAME} ${buildUsage(commandName, def.args)}`,
    '',
    ...wrap(def.description, MAX_WIDTH),
  ];
  if (positionals.length > 0) {
    sections.push('', 'Positionals:', formatTable(positionals));
  }
  sections.push('', 'Options:', formatTable(options));
  return sections.join('\n');
}

function describeOption(option: YargsOptions): string {
  const parts: string[] = [];
  if (typeof option.describe === 'string') {
    parts.push(option.describe.trim());
  }
  const meta: string[] = [];
  if (option.type) {
    meta.push(`[${option.type}]`);
  }
  if (option.choices) {
    meta.push(
      `[choices: ${option.choices.map(value => JSON.stringify(value)).join(', ')}]`,
    );
  }
  if (option.defaultDescription !== undefined) {
    meta.push(`[default: ${option.defaultDescription}]`);
  } else if (option.default !== undefined) {
    meta.push(`[default: ${JSON.stringify(option.default)}]`);
  }
  parts.push(meta.join(' '));
  return parts.filter(Boolean).join(' ');
}

export function formatStartHelp(options: Record<string, YargsOptions>): string {
  const rows: Array<[string, string]> = [];
  for (const [name, option] of Object.entries(options)) {
    if (option.hidden) {
      continue;
    }
    const names = [`--${name}`];
    if (option.alias) {
      const aliases = Array.isArray(option.alias)
        ? option.alias
        : [option.alias];
      names.push(...aliases.map(alias => `--${alias}`));
    }
    rows.push([names.join(', '), describeOption(option)]);
  }
  rows.push(['--help, -h', 'Show help [boolean]']);
  return [
    `${SCRIPT_NAME} start [--flags]`,
    '',
    'Start or restart chrome-devtools-mcp. All flags are forwarded to the chrome-devtools-mcp server.',
    '',
    'Options:',
    formatTable(rows),
    '',
    'Examples:',
    formatTable([
      [
        `${SCRIPT_NAME} start --browserUrl http://localhost:9222`,
        'Start the server connecting to an existing browser',
      ],
    ]),
  ].join('\n');
}
