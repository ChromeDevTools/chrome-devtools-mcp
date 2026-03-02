/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory, labels} from '../tools/categories.js';

import {type Commands} from './cliDefinitions.js';

const categoryOrder = Object.values(ToolCategory).map(
  category => labels[category],
);

export function generateCustomHelp(
  version: string,
  commands: Commands,
  withIndex = false,
): string {
  const categorizedTools: Record<string, string[]> = {};
  for (const [toolName, commandDef] of Object.entries(commands)) {
    const category = commandDef.category;
    if (category) {
      if (!categorizedTools[category]) {
        categorizedTools[category] = [];
      }
      categorizedTools[category].push(toolName);
    }
  }

  let help = `Chrome DevTools MCP CLI v${version}\n`;
  help += `USAGE\n  $ chrome-devtools <tool> [arguments] [flags]\n\n`;

  if (withIndex) {
    help += `TOOLS\n`;
    for (const category of categoryOrder) {
      help += `  ${category}\n`;
      if (!categorizedTools[category]) {
        continue;
      }
      for (const toolName of categorizedTools[category].sort()) {
        // Use description from commands object
        const commandDef = commands[toolName as keyof typeof commands];
        help += `    ${toolName.padEnd(20)} ${commandDef.description}\n`;
      }
    }
    help += `\n`;
  }

  help += `FLAGS\n`;
  help += `  --version             Show CLI version\n`;
  help += `  --help                Show CLI help\n\n`;

  help += `EXAMPLES\n`;
  help += `  $ chrome-devtools navigate_page "https://google.com"\n`;
  help += `  $ chrome-devtools fill "search_box_uid" "search query"\n`;
  help += `  $ chrome-devtools take_screenshot --fullPage true\n\n`;

  help += `LEARN MORE\n`;
  help += `  https://github.com/ChromeDevTools/chrome-devtools-mcp\n\n\n`;

  help += `TOOL DETAILS\n\n`;
  for (const category of categoryOrder) {
    if (!categorizedTools[category]) {
      continue;
    }
    help += `${category.toUpperCase()}\n\n`;
    for (const toolName of categorizedTools[category].sort()) {
      const commandDef = commands[toolName as keyof typeof commands];
      help += `  ${toolName}\n`;
      help += `    ${commandDef.description || ''}\n\n`;

      let usage = `    USAGE\n      $ chrome-devtools ${toolName}`;
      const args = commandDef ? Object.values(commandDef.args) : [];
      const requiredArgs = args.filter(a => a.required);
      const optionalArgs = args.filter(a => !a.required);

      for (const arg of requiredArgs) {
        usage += ` <${arg.name}>`;
      }
      if (optionalArgs.length > 0) {
        usage += ' [flags]';
      }
      help += `${usage}\n\n`;

      if (requiredArgs.length > 0) {
        help += '    ARGUMENTS\n';
        for (const arg of requiredArgs) {
          const typeHint =
            arg.type === 'number' ? `(${arg.type.toUpperCase()}) ` : '';
          help += `      <${arg.name}>                 ${typeHint}${
            arg.description || ''
          }\n`;
        }
        help += '\n';
      }

      if (optionalArgs.length > 0) {
        help += '    FLAGS\n';
        for (const arg of optionalArgs) {
          help += `      --${arg.name} <${arg.type}>   ${
            arg.description || ''
          }\n`;
        }
        help += '\n';
      }
    }
  }

  return help;
}
