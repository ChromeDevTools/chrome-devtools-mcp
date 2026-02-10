/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from './third_party/index.js';
import {yargs, hideBin} from './third_party/index.js';

export const cliOptions = {
  // Primary arg: workspace folder containing .vscode/devtools.json
  workspace: {
    type: 'string',
    description:
      'Path to workspace folder. Configuration is loaded from .vscode/devtools.json within this folder.',
    alias: 'w',
  },

  // VS Code's flag name, but used here to override the dev extension folder.
  // This is forwarded to the spawned VS Code instance as --extensionDevelopmentPath.
  extensionDevelopmentPath: {
    type: 'string',
    description:
      'Path to the VS Code extension folder to load under development (vsctk bridge). Overrides extensionPath in .vscode/devtools.json.',
    alias: 'e',
  },

  // Legacy args (kept for backwards compatibility, hidden from help)
  folder: {
    type: 'string',
    description: '[LEGACY] Use --workspace instead.',
    alias: 'f',
    hidden: true,
  },
  extensionBridgePath: {
    type: 'string',
    description:
      '[LEGACY] Override vsctk extension path. Prefer setting extensionPath in .vscode/devtools.json.',
    alias: 'b',
    hidden: true,
  },
  targetFolder: {
    type: 'string',
    description:
      '[LEGACY] Use --workspace to point to the target folder directly.',
    alias: 't',
    hidden: true,
  },
  headless: {
    type: 'boolean',
    description: '[LEGACY] Set headless in .vscode/devtools.json instead.',
    default: false,
    hidden: true,
  },
  logFile: {
    type: 'string',
    describe: '[LEGACY] Set logFile in .vscode/devtools.json instead.',
    hidden: true,
  },
  experimentalVision: {
    type: 'boolean',
    describe: 'Whether to enable vision tools.',
    hidden: true,
  },
  experimentalStructuredContent: {
    type: 'boolean',
    describe: 'Whether to output structured formatted content.',
    hidden: true,
  },
  devDiagnostic: {
    type: 'boolean',
    describe: '[LEGACY] Set devDiagnostic in .vscode/devtools.json instead.',
    default: false,
    hidden: true,
  },
  categoryPerformance: {
    type: 'boolean',
    default: true,
    describe: '[LEGACY] Set categories.performance in .vscode/devtools.json.',
    hidden: true,
  },
  categoryNetwork: {
    type: 'boolean',
    default: true,
    describe: '[LEGACY] Set categories.network in .vscode/devtools.json.',
    hidden: true,
  },
} satisfies Record<string, YargsOptions>;

export function parseArguments(version: string, argv = process.argv) {
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx vscode-devtools-mcp@latest')
    .options(cliOptions)
    .example([
      [
        '$0 --workspace /path/to/project',
        'Start MCP server for a workspace (config from .vscode/devtools.json)',
      ],
      [
        '$0 -w /path/to/project',
        'Short form of --workspace',
      ],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
