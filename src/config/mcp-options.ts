/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from '../third_party/index.js';
import os from 'node:os';
import path from 'node:path';

import {getCategoryOptions} from './category-options.js';
import {getBrowserOptions} from './browser-options.js';
import {puppeteerOptions} from './puppeteer-options.js';
import {toolOptions} from './tool-options.js';

export const DEFAULT_FILESYSTEM_ROOT = [os.tmpdir()];

export const mcpOptions = {
  ...getCategoryOptions(),
  ...getBrowserOptions(),
  ...puppeteerOptions,
  ...toolOptions,
  logFile: {
    type: 'string',
    describe:
      'Path to a file to write debug logs to. Set the env variable `NODE_DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.',
  },
  pageIdRouting: {
    type: 'boolean',
    describe:
      'Require pageId on page-scoped tools and route requests by page ID (useful for concurrent agent sessions). Use --no-page-id-routing to disable.',
    default: true,
  },
  devtoolsComments: {
    type: 'boolean',
    describe:
      'Whether to enable DevTools comments tools. Internal WIP feature.',
    hidden: true,
    default: false,
  },
  experimentalDevtools: {
    type: 'boolean',
    default: false,
    describe: 'Whether to enable automation over DevTools targets',
  },
  experimentalVision: {
    type: 'boolean',
    default: false,
    describe:
      'Whether to enable coordinate-based tools such as click_at(x,y). Usually requires a computer-use model able to produce accurate coordinates by looking at screenshots.',
  },
  memoryDebugging: {
    type: 'boolean',
    default: false,
    describe: 'Whether to enable memory debugging tools.',
    alias: 'experimentalMemory',
  },
  experimentalStructuredContent: {
    type: 'boolean',
    default: false,
    describe: 'Whether to output structured formatted content.',
  },
  experimentalToonFormat: {
    type: 'boolean',
    default: false,
    describe:
      'Deprecated: use --experimentalDataFormat=toon instead. Whether to format structured data using TOON (requires @toon-format/toon).',
    hidden: true,
  },
  experimentalDataFormat: {
    type: 'string',
    defaultDescription: 'default',
    describe:
      'Override format for structured data in text responses. Default uses built-in formatters. "toon" (requires @toon-format/toon) or "gcf" (requires @blackwell-systems/gcf) replace structured content with the specified encoding.',
    choices: ['default', 'toon', 'gcf'] as const,
    hidden: true,
  },
  experimentalIncludeAllPages: {
    type: 'boolean',
    default: false,
    describe:
      'Whether to include all kinds of pages such as webviews or background pages as pages.',
  },
  experimentalInteropTools: {
    type: 'boolean',
    default: false,
    describe: 'Whether to enable interoperability tools',
    hidden: true,
  },
  experimentalScreencast: {
    type: 'boolean',
    default: false,
    describe:
      'Exposes experimental screencast tools (requires ffmpeg). Install ffmpeg https://www.ffmpeg.org/download.html and ensure it is available in the MCP server PATH.',
  },
  experimentalFfmpegPath: {
    type: 'string',
    describe: 'Path to ffmpeg executable for screencast recording.',
  },
  experimentalScreencastFps: {
    type: 'number',
    describe:
      'Frames per second to use for screencast recording. Lower values can reduce memory pressure on pages that produce frames faster than ffmpeg can encode them.',
    coerce: (value: number | undefined) => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
          `Invalid experimentalScreencastFps ${value}. Expected a positive integer.`,
        );
      }
      return value;
    },
  },
  performanceCrux: {
    type: 'boolean',
    default: true,
    describe:
      'Set to false to disable sending URLs from performance traces to CrUX API to get field performance data.',
  },
  usageStatistics: {
    type: 'boolean',
    default: true,
    describe:
      'Set to false to opt-out of usage statistics collection. Google collects usage data to improve the tool, handled under the Google Privacy Policy (https://policies.google.com/privacy). This is independent from Chrome browser metrics. Disabled if `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` or `CI` env variables are set.',
  },
  javascriptEvaluation: {
    type: 'boolean',
    default: true,
    describe:
      'Set to false to disable JavaScript execution. When disabled, evaluation tools (evaluate_script and slim evaluate) are disabled, the initScript parameter in navigate_page is turned off, and navigating to javascript:, data:, or vbscript: URLs is disallowed.',
  },
  sourceMaps: {
    type: 'boolean',
    default: true,
    describe:
      'Whether to enable source maps in DevTools. Use --no-source-maps to disable.',
  },
  clearcutEndpoint: {
    type: 'string',
    hidden: true,
    describe: 'Endpoint for Clearcut telemetry.',
  },
  clearcutForceFlushIntervalMs: {
    type: 'number',
    hidden: true,
    describe: 'Force flush interval in milliseconds (for testing).',
  },
  clearcutIncludePidHeader: {
    type: 'boolean',
    default: false,
    hidden: true,
    describe: 'Include watchdog PID in Clearcut request headers (for testing).',
  },
  slim: {
    type: 'boolean',
    default: false,
    describe:
      'Exposes a "slim" set of 3 tools covering navigation, script execution and screenshots only. Useful for basic browser tasks.',
  },
  viaCli: {
    type: 'boolean',
    default: false,
    describe:
      'Set by Chrome DevTools CLI if the MCP server is started via the CLI client (this arg exists for usage stats)',
    hidden: true,
  },
  redactNetworkHeaders: {
    type: 'boolean',
    describe:
      'If true, redacts some of the network headers considered sensitive before returning to the client.',
    default: false,
  },
  allowUnrestrictedPaths: {
    type: 'boolean',
    default: false,
    deprecated: 'Use --workspace=/ instead.',
    describe:
      'If set, disables the default path restriction that applies when the MCP client does not negotiate ' +
      'the roots capability. By default, file-writing tools are restricted to the OS temp directory when ' +
      'no roots are configured. Use this only when connecting a trusted local client that does not implement ' +
      'MCP roots and requires access to paths outside the temp directory.',
  },
  filesystemRoot: {
    type: 'array',
    string: true,
    alias: 'workspace',
    default: DEFAULT_FILESYSTEM_ROOT,
    defaultDescription: 'OS temp directory',
    describe:
      'A directory that filesystem tools are allowed to access. May be specified more than once.',
  },
  config: {
    type: 'string',
    describe: 'Path to JSON configuration file.',
    coerce: (configPath: string | undefined) => {
      if (!configPath) {
        return;
      }
      return path.resolve(configPath);
    },
  },
} satisfies Record<string, YargsOptions>;

export function getMcpOptionsForViaCli(): Record<
  keyof typeof mcpOptions,
  YargsOptions
> {
  if (!('default' in mcpOptions.headless)) {
    throw new Error('headless cli option unexpectedly does not have a default');
  }
  if (!('default' in mcpOptions.experimentalStructuredContent)) {
    throw new Error(
      'experimentalStructuredContent cli option unexpectedly does not have a default',
    );
  }

  return {
    ...mcpOptions,
    headless: {
      ...mcpOptions.headless,
      default: true,
    },
    memoryDebugging: {
      ...mcpOptions.memoryDebugging,
      default: true,
    },
    categoryExtensions: {
      ...mcpOptions.categoryExtensions,
      defaultDescription:
        'true unless autoConnect, browserUrl or wsEndpoint is set',
    },
    experimentalStructuredContent: {
      ...mcpOptions.experimentalStructuredContent,
      default: true,
    },
    isolated: {
      ...mcpOptions.isolated,
      description:
        'If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed. Defaults to true unless userDataDir is provided.',
      defaultDescription:
        'true unless userDataDir, autoConnect, browserUrl or wsEndpoint is set',
    },
  };
}

export function getCliOptions(): Partial<
  Record<keyof typeof mcpOptions, YargsOptions>
> {
  const options: Partial<Record<keyof typeof mcpOptions, YargsOptions>> =
    withoutDefaults(getMcpOptionsForViaCli());

  // Missing CLI serialization.
  delete options.viewport;

  // Change the defaults for the CLI.
  delete options.experimentalStructuredContent;
  delete options.experimentalInteropTools;

  return options;
}

export const CLI_EXAMPLES: Array<[string, string]> = [
  [
    '$0 --browserUrl http://127.0.0.1:9222',
    'Connect to an existing browser instance via HTTP',
  ],
  [
    '$0 --wsEndpoint ws://127.0.0.1:9222/devtools/browser/abc123',
    'Connect to an existing browser instance via WebSocket',
  ],
  [
    `$0 --wsEndpoint ws://127.0.0.1:9222/devtools/browser/abc123 --wsHeaders '{"Authorization":"Bearer token"}'`,
    'Connect via WebSocket with custom headers',
  ],
  ['$0 --channel beta', 'Use Chrome Beta installed on this system'],
  ['$0 --channel canary', 'Use Chrome Canary installed on this system'],
  ['$0 --channel dev', 'Use Chrome Dev installed on this system'],
  ['$0 --channel stable', 'Use stable Chrome installed on this system'],
  ['$0 --logFile /tmp/log.txt', 'Save logs to a file'],
  ['$0 --help', 'Print CLI options'],
  [
    '$0 --viewport 1280x720',
    'Launch Chrome with the initial viewport size of 1280x720px',
  ],
  [
    `$0 --chrome-arg='--no-sandbox' --chrome-arg='--disable-setuid-sandbox'`,
    'Launch Chrome without sandboxes. Use with caution.',
  ],
  [
    `$0 --ignore-default-chrome-arg='--disable-extensions'`,
    'Disable the default arguments provided by Puppeteer. Use with caution.',
  ],
  ['$0 --no-category-emulation', 'Disable tools in the emulation category'],
  ['$0 --no-category-performance', 'Disable tools in the performance category'],
  ['$0 --no-category-network', 'Disable tools in the network category'],
  ['$0 --user-data-dir=/tmp/user-data-dir', 'Use a custom user data directory'],
  [
    '$0 --auto-connect',
    'Connect to a stable Chrome instance (Chrome 144+) running instead of launching a new instance',
  ],
  [
    '$0 --auto-connect --channel=canary',
    'Connect to a canary Chrome instance (Chrome 144+) running instead of launching a new instance',
  ],
  [
    '$0 --no-usage-statistics',
    'Do not send usage statistics https://github.com/ChromeDevTools/chrome-devtools-mcp#usage-statistics.',
  ],
  [
    '$0 --no-performance-crux',
    'Disable CrUX (field data) integration in performance tools.',
  ],
  ['$0 --no-source-maps', 'Disable source maps in DevTools.'],
  [
    '$0 --no-javascript-evaluation',
    'Disable JavaScript execution (disables evaluation tools, initScript in navigate_page, and navigating to javascript:, data:, or vbscript: URLs).',
  ],
  [
    '$0 --slim',
    'Only 3 tools: navigation, JavaScript execution and screenshot',
  ],
];

export const CONFLICTING_ARGS: Array<Array<keyof typeof mcpOptions>> = [
  ['channel', 'executablePath', 'browserUrl', 'wsEndpoint'],
  ['userDataDir', 'browserUrl', 'wsEndpoint'],
  ['userDataDir', 'isolated'],
  ['autoConnect', 'isolated'],
  ['autoConnect', 'executablePath'],
  ['blockedUrlPattern', 'allowedUrlPattern'],
  ['allowUnrestrictedPaths', 'filesystemRoot'],
  ['categoryPwa', 'autoConnect'],
  ['categoryPwa', 'browserUrl', 'wsEndpoint'],
  ['categoryExtensions', 'autoConnect'],
  ['categoryExtensions', 'browserUrl', 'wsEndpoint'],
];

export const IMPLICATIONS: Array<
  [keyof typeof mcpOptions, keyof typeof mcpOptions]
> = [
  ['wsHeaders', 'wsEndpoint'],
  ['experimentalFfmpegPath', 'experimentalScreencast'],
  ['experimentalScreencastFps', 'experimentalScreencast'],
];

export function withoutDefaults(
  options: Record<string, YargsOptions>,
): Record<string, YargsOptions> {
  const result: Record<string, YargsOptions> = {};
  for (const [key, option] of Object.entries(options)) {
    const copy: YargsOptions = {...option};
    if (copy.default !== undefined) {
      copy.defaultDescription ??= JSON.stringify(copy.default);
      delete copy.default;
    }
    result[key] = copy;
  }
  return result;
}
