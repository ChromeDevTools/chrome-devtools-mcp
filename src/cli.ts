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
    // NOTE: No default value to avoid conflicts with attachTabUrl
    // When not specified, defaults to false in resolveBrowser()
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
  chromeProfile: {
    type: 'string' as const,
    description:
      'Specify Chrome profile name (e.g., "Default", "Profile 1", "Profile 2"). If not specified, uses last_used from Local State. Only effective when --loadSystemExtensions is true.',
    conflicts: 'browserUrl',
  },
  userDataDir: {
    type: 'string' as const,
    description:
      'Specify a custom user data directory for Chrome to use instead of the default. Auto-detected if not specified.',
    conflicts: 'browserUrl',
  },
  logFile: {
    type: 'string' as const,
    describe:
      'Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.',
  },
  projectRoot: {
    type: 'string' as const,
    description:
      'Explicitly specify the project root directory for profile isolation. Overrides MCP roots/list. Useful when roots/list is not available.',
    conflicts: 'browserUrl',
  },
  focus: {
    type: 'boolean' as const,
    description:
      'Bring Chrome window to foreground on launch. By default, Chrome launches in the background to avoid interrupting your work.',
    default: false,
  },
  attachTab: {
    type: 'number' as const,
    description:
      'Attach to an existing Chrome tab via Extension Bridge using tab ID. Requires chrome-ai-bridge extension to be installed and running. Mutually exclusive with browser launch options.',
    conflicts: ['browserUrl', 'headless', 'executablePath', 'isolated', 'channel', 'loadExtension', 'loadExtensionsDir', 'loadSystemExtensions', 'attachTabUrl'],
  },
  attachTabUrl: {
    type: 'string' as const,
    description:
      'Attach to an existing Chrome tab via Extension Bridge using URL pattern (e.g., https://chatgpt.com/). The extension will automatically find and connect to a matching tab. Mutually exclusive with browser launch options and attachTab.',
    conflicts: ['browserUrl', 'headless', 'executablePath', 'isolated', 'channel', 'loadExtension', 'loadExtensionsDir', 'loadSystemExtensions', 'attachTab'],
  },
  attachTabNew: {
    type: 'boolean' as const,
    description:
      'Always open a new tab when using --attachTabUrl. Useful for running multiple projects in separate tabs.',
    default: false,
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
    .check(args => {
      // Auto-configuration for zero-config setup
      if (
        !args.channel &&
        !args.browserUrl &&
        !args.executablePath &&
        !args.attachTab &&
        !args.attachTabUrl
      ) {
        args.channel = 'stable';
      }

      return true;
    })
    .example([
      ['$0', 'Zero-config startup: auto-detects profile and bookmarks'],
      [
        '$0 --browserUrl http://127.0.0.1:9222',
        'Connect to an existing browser instance',
      ],
      ['$0 --channel beta', 'Use Chrome Beta installed on this system'],
      ['$0 --channel canary', 'Use Chrome Canary installed on this system'],
      ['$0 --channel dev', 'Use Chrome Dev installed on this system'],
      ['$0 --channel stable', 'Use stable Chrome installed on this system'],
      [
        '$0 --loadSystemExtensions',
        'Auto-discover and load system Chrome extensions',
      ],
      [
        '$0 --loadExtensionsDir ./extensions --loadSystemExtensions',
        'Load both development and system extensions',
      ],
      ['$0 --logFile /tmp/log.txt', 'Save logs to a file'],
      ['$0 --help', 'Print CLI options'],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
