/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

export const cliOptions = {
  browserUrl: {
    type: 'string' as const,
    description:
      'Connect to a running Chrome instance using port forwarding. For more details see: https://developer.chrome.com/docs/devtools/remote-debugging/local-server.',
    alias: 'u',
    coerce: (url: string) => {
      new URL(url);
      return url;
    },
  },
  headless: {
    type: 'boolean' as const,
    description: 'Whether to run in headless (no UI) mode.',
    default: false,
  },
  executablePath: {
    type: 'string' as const,
    description: 'Path to custom Chrome executable.',
    conflicts: 'browserUrl',
    alias: 'e',
  },
  isolated: {
    type: 'boolean' as const,
    description:
      'If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed.',
    default: false,
  },
  customDevtools: {
    type: 'string' as const,
    description: 'Path to custom DevTools.',
    hidden: true,
    conflicts: 'browserUrl',
    alias: 'd',
  },
  channel: {
    type: 'string' as const,
    description:
      'Specify a different Chrome channel that should be used. The default is the stable channel version.',
    choices: ['stable', 'canary', 'beta', 'dev'] as const,
    conflicts: ['browserUrl', 'executablePath'],
  },
  logFile: {
    type: 'string' as const,
    describe:
      'Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.',
  },
};

export function parseArguments(version: string, argv = process.argv) {
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx chrome-devtools-mcp@latest')
    .options(cliOptions)
    .check(args => {
      // We can't set default in the options else
      // Yargs will complain
      if (!args.channel && !args.browserUrl && !args.executablePath) {
        args.channel = 'stable';
      }
      return true;
    })
    .example([
      [
        '$0 --browserUrl http://127.0.0.1:9222',
        'Connect to an existing browser instance',
      ],
      ['$0 --channel beta', 'Use Chrome Beta installed on this system'],
      ['$0 --channel canary', 'Use Chrome Canary installed on this system'],
      ['$0 --channel dev', 'Use Chrome Dev installed on this system'],
      ['$0 --channel stable', 'Use stable Chrome installed on this system'],
      ['$0 --logFile /tmp/log.txt', 'Save logs to a file'],
      ['$0 --help', 'Print CLI options'],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
