/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

// Auto-detection functions for zero-config setup
function getDefaultUserDataDir(): string {
  return path.join(
    os.homedir(),
    '.cache',
    'chrome-devtools-mcp',
    'chrome-profile'
  );
}

function getDefaultExtensionsDir(): string | undefined {
  // Disabled automatic detection of ./extensions folder
  // Users should explicitly use --loadExtension or --loadExtensionsDir flags
  return undefined;
}

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
  loadExtension: {
    type: 'string' as const,
    description:
      'Load an unpacked Chrome extension from the specified directory path.',
    conflicts: 'browserUrl',
  },
  loadExtensionsDir: {
    type: 'string' as const,
    description:
      'Load all unpacked Chrome extensions from the specified directory. Each subdirectory with manifest.json will be loaded as an extension.',
    conflicts: 'browserUrl',
  },
  loadSystemExtensions: {
    type: 'boolean' as const,
    description:
      'Automatically discover and load extensions installed in the system Chrome profile. This includes extensions from Chrome Web Store and sideloaded extensions.',
    default: false,
    conflicts: 'browserUrl',
  },
  userDataDir: {
    type: 'string' as const,
    description: 'Specify a custom user data directory for Chrome to use instead of the default. Auto-detected if not specified.',
    conflicts: 'browserUrl',
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
      // Auto-configuration for zero-config setup
      if (!args.channel && !args.browserUrl && !args.executablePath) {
        args.channel = 'stable';
      }

      // Don't set userDataDir here - let browser.ts handle auto-detection
      // This allows browser.ts to detect and use the system Chrome profile

      // Auto-detect extensions directory if not specified
      if (!args.loadExtensionsDir && !args.browserUrl) {
        const autoExtensionsDir = getDefaultExtensionsDir();
        if (autoExtensionsDir) {
          args.loadExtensionsDir = autoExtensionsDir;
          console.error(`🔧 Auto-detected extensions directory: ${autoExtensionsDir}`);
        }
      }

      return true;
    })
    .example([
      [
        '$0',
        'Zero-config startup: auto-detects extensions, bookmarks, and profile',
      ],
      [
        '$0 --browserUrl http://127.0.0.1:9222',
        'Connect to an existing browser instance',
      ],
      ['$0 --channel beta', 'Use Chrome Beta installed on this system'],
      ['$0 --channel canary', 'Use Chrome Canary installed on this system'],
      ['$0 --channel dev', 'Use Chrome Dev installed on this system'],
      ['$0 --channel stable', 'Use stable Chrome installed on this system'],
      ['$0 --loadSystemExtensions', 'Auto-discover and load system Chrome extensions'],
      ['$0 --loadExtensionsDir ./extensions --loadSystemExtensions', 'Load both development and system extensions'],
      ['$0 --logFile /tmp/log.txt', 'Save logs to a file'],
      ['$0 --help', 'Print CLI options'],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
