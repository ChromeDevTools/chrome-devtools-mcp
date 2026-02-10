/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from './third_party/index.js';
import {yargs, hideBin} from './third_party/index.js';

export const cliOptions = {
  // Primary arg: target workspace folder (the extension dev host opens this).
  // Also used as the base path for loading .devtools/devtools.jsonc.
  'test-workspace': {
    type: 'string',
    description:
      'Path to the target workspace folder. Configuration is loaded from .devtools/devtools.jsonc within this folder.',
    alias: 'w',
  },

  // Path to the dev extension folder.
  // This is forwarded to the spawned VS Code instance as --extensionDevelopmentPath.
  extension: {
    type: 'string',
    description:
      'Path to the VS Code extension folder to load under development (vsctk bridge). Overrides extensionPath in .devtools/devtools.jsonc.',
    alias: 'e',
  },

  // Backwards-compatibility aliases (hidden from help)
  workspace: {
    type: 'string',
    description: '[LEGACY] Use --test-workspace instead.',
    hidden: true,
  },
  extensionDevelopmentPath: {
    type: 'string',
    description: '[LEGACY] Use --extension instead.',
    hidden: true,
  },

  // Legacy args (kept for backwards compatibility, hidden from help)
  folder: {
    type: 'string',
    description: '[LEGACY] Use --test-workspace instead.',
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
      '[LEGACY] Use --test-workspace to point to the target folder directly.',
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
        '$0 --test-workspace /path/to/project',
        'Start MCP server for a workspace (config from .devtools/devtools.jsonc)',
      ],
      [
        '$0 -w /path/to/project',
        'Short form of --test-workspace',
      ],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
