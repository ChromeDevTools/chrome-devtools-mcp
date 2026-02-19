/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from './third_party/index.js';
import {yargs, hideBin} from './third_party/index.js';

export const cliOptions = {
  headless: {
    type: 'boolean',
    description: 'Run VS Code headless (Linux only). Overrides client config.',
    default: false,
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
    describe: 'Enable extra diagnostic tools.',
    default: false,
    hidden: true,
  },
} satisfies Record<string, YargsOptions>;

export function parseArguments(version: string, argv = process.argv) {
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx mcp-server@latest')
    .options(cliOptions)
    .example([
      [
        '$0',
        'Start MCP server (reads config from .devtools/host.config.jsonc)',
      ],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
