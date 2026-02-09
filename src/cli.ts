/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from './third_party/index.js';
import {yargs, hideBin} from './third_party/index.js';

export const cliOptions = {
  folder: {
    type: 'string',
    description:
      'Path to workspace folder to open in VS Code. The MCP server will spawn a VS Code Extension Development Host window targeting this folder.',
    alias: 'f',
  },
  extensionBridgePath: {
    type: 'string',
    description:
      'Path to the extension-bridge extension directory. Defaults to the extension-bridge folder adjacent to the vscode-devtools-mcp package.',
    alias: 'b',
  },
  targetFolder: {
    type: 'string',
    description:
      'Path to a folder to open in the Extension Development Host. If not specified, the workspace folder is used.',
    alias: 't',
  },
  headless: {
    type: 'boolean',
    description: 'Run VS Code headless (requires xvfb on Linux).',
    default: false,
  },
  logFile: {
    type: 'string',
    describe:
      'Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs.',
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
    describe:
      'Enable diagnostic development tools (debug_evaluate). Hidden in production.',
    default: false,
    hidden: true,
  },
  categoryPerformance: {
    type: 'boolean',
    default: true,
    describe: 'Set to false to exclude tools related to performance.',
  },
  categoryNetwork: {
    type: 'boolean',
    default: true,
    describe: 'Set to false to exclude tools related to network.',
  },
  dev: {
    type: 'boolean',
    describe:
      'Dev mode: run from TypeScript source via tsx with automatic file-watching and self-restart on changes.',
    default: false,
    hidden: true,
  },
} satisfies Record<string, YargsOptions>;

export function parseArguments(version: string, argv = process.argv) {
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx vscode-devtools-mcp@latest')
    .options(cliOptions)
    .example([
      [
        '$0 --folder /path/to/project',
        'Spawn a VS Code debug window for the project folder',
      ],
      ['$0 --headless', 'Run VS Code in headless mode (Linux only)'],
      ['$0 --logFile /tmp/log.txt', 'Save logs to a file'],
      [
        '$0 --dev-diagnostic',
        'Enable diagnostic tools for development debugging',
      ],
      [
        '$0 --no-category-performance',
        'Disable tools in the performance category',
      ],
      [
        '$0 --no-category-network',
        'Disable tools in the network category',
      ],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
