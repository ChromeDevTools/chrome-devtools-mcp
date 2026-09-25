/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from '../third_party/index.js';
import {yargs, hideBin, zod as z} from '../third_party/index.js';
import os from 'node:os';
import {readFileSync} from 'node:fs';
import path from 'node:path';

export const DEFAULT_FILESYSTEM_ROOT = [os.tmpdir()];

import {getCategoryOptions} from './category-options.js';
import {getBrowserOptions} from './browser-options.js';

export const mcpOptions = {
  ...getCategoryOptions(),
  ...getBrowserOptions(),
  logFile: {
    type: 'string',
    describe:
      'Path to a file to write debug logs to. Set the env variable `NODE_DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.',
  },
  viewport: {
    type: 'string',
    describe:
      'Initial viewport size for the Chrome instances started by the server. For example, `1280x720`. In headless mode, max size is 3840x2160px.',
    coerce: (arg: string | undefined) => {
      if (arg === undefined) {
        return;
      }
      const [width, height] = arg.split('x').map(Number);
      if (!width || !height || Number.isNaN(width) || Number.isNaN(height)) {
        throw new Error('Invalid viewport. Expected format is `1280x720`.');
      }
      return {
        width,
        height,
      };
    },
  },
  acceptInsecureCerts: {
    type: 'boolean',
    default: false,
    description: `If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.`,
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
    default: 'default' as const,
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
    implies: 'experimentalScreencast',
  },
  experimentalScreencastFps: {
    type: 'number',
    describe:
      'Frames per second to use for screencast recording. Lower values can reduce memory pressure on pages that produce frames faster than ffmpeg can encode them.',
    implies: 'experimentalScreencast',
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
  blockedUrlPattern: {
    type: 'array',
    string: true,
    describe:
      "Restricts browser's network access by blocking specified URL patterns (uses https://urlpattern.spec.whatwg.org/). Silently detaches from targets with blocked URLs upon connection, and blocks runtime requests (including navigations and subresources). Accepts an array of patterns.",
  },
  allowedUrlPattern: {
    type: 'array',
    string: true,
    describe:
      "Restricts browser's network access by allowing only specified URL patterns (uses https://urlpattern.spec.whatwg.org/). Requires Chrome 149+. Silently detaches from targets with unallowed URLs upon connection, and blocks runtime requests (including navigations and subresources). Accepts an array of patterns.",
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
  screenshotFormat: {
    type: 'string',
    default: 'png' as const,
    description:
      'Override the default output format used by take_screenshot when the caller does not specify one. JPEG and WebP are ~3-5x smaller than PNG, which reduces transfer and storage size. To reduce context size use --screenshotMaxWidth / --screenshotMaxHeight, since image tokens scale with dimensions rather than encoded bytes. Unset preserves the existing default ("png").',
    choices: ['jpeg', 'png', 'webp'] as const,
  },
  screenshotQuality: {
    type: 'number',
    description:
      'Override the default compression quality (0-100) used by take_screenshot for JPEG and WebP when the caller does not specify one. Lower values mean smaller files. Ignored for PNG. Unset preserves the Puppeteer default.',
    coerce: (value: number | undefined) => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new Error(
          `Invalid screenshotQuality ${value}. Expected an integer between 0 and 100.`,
        );
      }
      return value;
    },
  },
  screenshotMaxWidth: {
    type: 'number',
    description:
      'Maximum width in pixels for screenshots. If the captured image is wider, it is downscaled (preserving aspect ratio) before being returned. Reduces context size in AI conversations. Unset means no resize.',
    coerce: (value: number | undefined) => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
          `Invalid screenshotMaxWidth ${value}. Expected a positive integer.`,
        );
      }
      return value;
    },
  },
  screenshotMaxHeight: {
    type: 'number',
    description:
      'Maximum height in pixels for screenshots. If the captured image is taller, it is downscaled (preserving aspect ratio) before being returned. Can be combined with --screenshot-max-width; the smaller scale factor wins. Unset means no resize.',
    coerce: (value: number | undefined) => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
          `Invalid screenshotMaxHeight ${value}. Expected a positive integer.`,
        );
      }
      return value;
    },
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

export type ParsedArguments = ReturnType<
  ReturnType<typeof parser>['parseSync']
>;

export function getMcpOptionsForViaCli(): typeof mcpOptions {
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
      default: true,
    },
    experimentalStructuredContent: {
      ...mcpOptions.experimentalStructuredContent,
      default: true,
    },
    isolated: {
      ...mcpOptions.isolated,
      description:
        'If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed. Defaults to true unless userDataDir is provided.',
    },
  };
}

export function getCliOptions(): Partial<
  Record<keyof typeof mcpOptions, YargsOptions>
> {
  const options: Partial<Record<keyof typeof mcpOptions, YargsOptions>> = {
    ...getMcpOptionsForViaCli(),
  };

  // Missing CLI serialization.
  delete options.viewport;

  // Change the defaults for the CLI.
  delete options.experimentalStructuredContent;
  delete options.experimentalInteropTools;

  const recordOptions: Record<string, YargsOptions | undefined> = options;
  for (const [key, option] of Object.entries(recordOptions)) {
    if (option?.default !== undefined) {
      const copy: YargsOptions = {
        ...option,
        defaultDescription:
          option.defaultDescription ?? JSON.stringify(option.default),
      };
      delete copy.default;
      recordOptions[key] = copy;
    }
  }

  return options;
}

export function parser(version: string, argv = process.argv) {
  // Used to derive the ParsedArguments type and for help output.
  const isViaCli = argv.includes('--viaCli') || argv.includes('--via-cli');
  const options = isViaCli ? getMcpOptionsForViaCli() : mcpOptions;

  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx chrome-devtools-mcp@latest')
    .parserConfiguration({
      'strip-aliased': true,

      'strip-dashed': true,
    })
    .options(options)
    .showHelpOnFail(false, 'Specify --help for available options')
    .wrap(Math.min(120, yargs(hideBin(argv)).terminalWidth()))
    .help()
    .version(version);

  return yargsInstance;
}

export function parseArguments(
  version: string,
  argv = process.argv,
  env = process.env,
) {
  const isViaCli = argv.includes('--viaCli') || argv.includes('--via-cli');
  const baseOptions = isViaCli ? getMcpOptionsForViaCli() : mcpOptions;

  // Step 1 & 2: Independent Parsing (Bypassing yargs Defaults)
  const optionsWithoutDefaults: Record<string, YargsOptions> = {};
  for (const [key, option] of Object.entries(baseOptions)) {
    const copy: YargsOptions = {...option};
    if (copy.default !== undefined) {
      copy.defaultDescription ??= JSON.stringify(copy.default);
      delete copy.default;
    }
    optionsWithoutDefaults[key] = copy;
  }

  const yargsInstance = yargs(hideBin(argv))
    .scriptName('npx chrome-devtools-mcp@latest')
    .parserConfiguration({
      'strip-aliased': true,
      'strip-dashed': true,
    })
    .options(optionsWithoutDefaults)
    .fail(false)
    .exitProcess(false)
    .version(version);

  let rawCli: Record<string, unknown> = {};
  try {
    rawCli = yargsInstance.parseSync();
  } catch (err) {
    throw new Error(
      `Unknown arguments or invalid CLI usage: ${getErrorMessage(err)}`,
    );
  }

  // Config file parsing
  let parsedConfigFile: Record<string, unknown> = {};
  if (typeof rawCli.config === 'string') {
    try {
      const fileContent: unknown = JSON.parse(
        readFileSync(rawCli.config, 'utf-8'),
      );
      if (!isPlainObject(fileContent)) {
        throw new Error('Config must be a JSON object');
      }

      // Run the config through yargs to reject unknown keys and apply
      // coercions, but without defaults.
      parsedConfigFile = yargs([])
        .parserConfiguration({
          'strip-aliased': true,
          'camel-case-expansion': false,
        })
        .options(optionsWithoutDefaults)
        .config(fileContent)
        .strict()
        .fail(false)
        .exitProcess(false)
        .parseSync([]);
    } catch (err) {
      throw new Error(`Invalid JSON config file: ${getErrorMessage(err)}`);
    }
  }

  // Step 3: Cascade Merge of Explicit Inputs
  const explicitConfig = {...parsedConfigFile, ...rawCli};

  // Step 4: Dynamic Default Resolution
  const resolvedConfig = {...explicitConfig};

  for (const [key, option] of Object.entries(baseOptions)) {
    if (resolvedConfig[key] === undefined && 'default' in option) {
      resolvedConfig[key] = option.default;
    }
  }

  resolvedConfig.channel = resolvedConfig.channel ?? 'stable';
  if (isViaCli) {
    if (resolvedConfig.filesystemRoot === DEFAULT_FILESYSTEM_ROOT) {
      resolvedConfig.allowUnrestrictedPaths = true;
      resolvedConfig.filesystemRoot = undefined;
    }
    if (
      resolvedConfig.isolated === undefined &&
      resolvedConfig.userDataDir === undefined &&
      !resolvedConfig.autoConnect &&
      !resolvedConfig.browserUrl &&
      !resolvedConfig.wsEndpoint
    ) {
      resolvedConfig.isolated = true;
    }
  }
  resolvedConfig.isolated = resolvedConfig.isolated ?? false;

  if (
    resolvedConfig.experimentalToonFormat &&
    resolvedConfig.experimentalDataFormat === 'default'
  ) {
    resolvedConfig.experimentalDataFormat = 'toon';
  }
  if (env['CI'] || env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS']) {
    console.error(
      "turning off usage statistics. process.env['CI'] || process.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS'] is set.",
    );
    resolvedConfig.usageStatistics = false;
  }

  const cliOptionsAllowedArgs = [...Object.keys(baseOptions), '_', '$0'];

  const unknownArgs = Object.keys(rawCli).filter(
    arg => !cliOptionsAllowedArgs.includes(arg),
  );

  if (unknownArgs.length > 0) {
    console.error(`Unknown arguments: ${unknownArgs.map(arg => `--${arg}`)}`);
  }

  // Step 5: Final Schema Validation & Type Safety. Conflicts are only checked
  // against explicit user input so that dynamic defaults never conflict.
  const ConfigSchema = z
    .object({})
    .passthrough()
    .superRefine((_config, ctx) => {
      const activeArgs = new Set<string>();
      for (const [key, val] of Object.entries(explicitConfig)) {
        if (val !== undefined && val !== false) {
          activeArgs.add(key);
        }
      }

      for (const group of CONFLICTING_ARGS) {
        const activeInGroup = group.filter(arg => activeArgs.has(arg));
        if (activeInGroup.length > 1) {
          const [arg1, arg2] = activeInGroup;
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Arguments ${arg1} and ${arg2} are mutually exclusive`,
            path: [arg1, arg2],
          });
        }
      }
    });

  const result = ConfigSchema.safeParse(resolvedConfig);
  if (!result.success) {
    throw new Error(result.error.issues[0].message);
  }
  if (!isParsedArguments(result.data)) {
    throw new Error('Failed to resolve configuration');
  }
  return result.data;
}

const CONFLICTING_ARGS: string[][] = [
  ['channel', 'executablePath', 'browserUrl', 'wsEndpoint'],
  ['userDataDir', 'browserUrl', 'wsEndpoint'],
  ['userDataDir', 'isolated'],
  ['autoConnect', 'isolated'],
  ['autoConnect', 'executablePath'],
  ['blockedUrlPattern', 'allowedUrlPattern'],
  ['categoryPwa', 'autoConnect'],
  ['categoryPwa', 'browserUrl', 'wsEndpoint'],
  ['categoryExtensions', 'autoConnect'],
  ['categoryExtensions', 'browserUrl', 'wsEndpoint'],
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParsedArguments(value: unknown): value is ParsedArguments {
  return isPlainObject(value) && Array.isArray(value['_']);
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
