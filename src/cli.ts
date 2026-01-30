/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI - Simplified for Extension-only mode (v2.0.0)
 *
 * Puppeteer-based options have been removed.
 * All browser interaction is via Chrome extension WebSocket relay.
 */

import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

export const cliOptions = {
  logFile: {
    type: 'string' as const,
    describe:
      'Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.',
  },
  extensionRelayPort: {
    type: 'number' as const,
    description:
      'Port for Extension Bridge WebSocket relay server. Default: 0 (auto-assign).',
    default: 0,
  },
};

export function parseArguments(version: string, argv = process.argv) {
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx chrome-ai-bridge@latest')
    .options(cliOptions)
    .example([
      ['$0', 'Start MCP server (requires chrome-ai-bridge extension)'],
      ['$0 --logFile /tmp/log.txt', 'Save logs to a file'],
      ['$0 --help', 'Print CLI options'],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
