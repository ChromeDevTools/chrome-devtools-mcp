/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions, InferredOptionTypes} from '../third_party/index.js';

import {yargs, hideBin} from '../third_party/index.js';

import {readFileSync} from 'node:fs';

import {
  mcpOptions,
  getMcpOptionsForViaCli,
  CLI_EXAMPLES,
  CONFLICTING_ARGS,
  IMPLICATIONS,
  DEFAULT_FILESYSTEM_ROOT,
  withoutDefaults,
} from './mcp-options.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stripYargsPositionalArgs<T extends {_?: unknown; $0?: unknown}>(
  parsed: T,
): Omit<T, '_' | '$0'> {
  const {_: _positionals, $0: _scriptName, ...rest} = parsed;
  return rest;
}

export type RawParsedArguments = InferredOptionTypes<typeof mcpOptions>;

export type ParsedArguments = {
  [
    K in keyof RawParsedArguments as K extends '_' | '$0' ? never : K
  ]: RawParsedArguments[K];
};

export class ConfigParser {
  constructor(
    private version: string,
    private argv = process.argv,
    private env = process.env,
    private exitProcess = true,
  ) {}

  buildCliParser<O extends Record<string, YargsOptions> = typeof mcpOptions>(
    options: O = mcpOptions as unknown as O,
  ) {
    const yargsInstance = yargs(hideBin(this.argv));
    return yargsInstance
      .scriptName('npx chrome-devtools-mcp@latest')
      .parserConfiguration({
        'strip-aliased': true,
        'strip-dashed': true,
      })
      .options(options)
      .showHelpOnFail(false, 'Specify --help for available options')
      .example(CLI_EXAMPLES)
      .wrap(Math.min(120, yargsInstance.terminalWidth()))
      .help()
      .version(this.version);
  }

  parseCliArgs(): ParsedArguments {
    const parsed = this.buildCliParser(
      withoutDefaults(mcpOptions) as unknown as typeof mcpOptions,
    )
      .fail(false)
      .parseSync();
    return stripYargsPositionalArgs(parsed) as unknown as ParsedArguments;
  }

  parseConfigFile(configPath: string): ParsedArguments {
    try {
      const fileContent: unknown = JSON.parse(
        readFileSync(configPath, 'utf-8'),
      );
      if (!isPlainObject(fileContent)) {
        throw new Error('Config must be a JSON object');
      }
      const parsed = yargs([])
        .parserConfiguration({
          'strip-aliased': true,
          'camel-case-expansion': false,
        })
        .options(withoutDefaults(mcpOptions))
        .config(fileContent)
        .strict()
        .fail(false)
        .exitProcess(false)
        .parseSync([]);
      return stripYargsPositionalArgs(parsed) as unknown as ParsedArguments;
    } catch (err) {
      throw new Error(`Invalid JSON config file: ${getErrorMessage(err)}`);
    }
  }

  warnUnknownArgs(cliArgs: Record<string, unknown>): void {
    const allowedArgs = new Set(Object.keys(mcpOptions));
    const unknownArgs = Object.keys(cliArgs).filter(
      arg => !allowedArgs.has(arg),
    );
    if (unknownArgs.length > 0) {
      console.error(`Unknown arguments: ${unknownArgs.map(arg => `--${arg}`)}`);
    }
  }

  validateConflicts(explicitArgs: Record<string, unknown>): void {
    const activeArgs = new Set<string>();
    for (const [key, val] of Object.entries(explicitArgs)) {
      if (val !== undefined && val !== false) {
        activeArgs.add(key);
      }
    }
    for (const group of CONFLICTING_ARGS) {
      const activeInGroup = group.filter(arg => activeArgs.has(arg as string));
      if (activeInGroup.length > 1) {
        const [arg1, arg2] = activeInGroup;
        throw new Error(
          `Arguments ${String(arg1)} and ${String(arg2)} are mutually exclusive`,
        );
      }
    }
  }

  validateImplications(explicitArgs: Record<string, unknown>): void {
    for (const [key, implied] of IMPLICATIONS) {
      const isKeySet =
        explicitArgs[key as keyof Record<string, unknown>] !== undefined &&
        explicitArgs[key as keyof Record<string, unknown>] !== false;
      const isImpliedSet =
        explicitArgs[implied as keyof Record<string, unknown>] !== undefined &&
        explicitArgs[implied as keyof Record<string, unknown>] !== false;
      if (isKeySet && !isImpliedSet) {
        throw new Error(
          `Implications failed:\n  ${String(key)} -> ${String(implied)}`,
        );
      }
    }
  }

  applyDefaults(explicitArgs: Record<string, unknown>): ParsedArguments {
    const isViaCli = (explicitArgs as Record<string, unknown>).viaCli === true;
    const baseOptions = isViaCli ? getMcpOptionsForViaCli() : mcpOptions;
    const resolvedArgs = {...explicitArgs} as Record<string, unknown>;
    // `channel` only applies when Chrome is launched by channel. Leaving it
    // unset otherwise keeps it out of telemetry (computeFlagUsage).
    const launchesByChannel =
      !resolvedArgs.browserUrl &&
      !resolvedArgs.wsEndpoint &&
      !resolvedArgs.executablePath;

    for (const [key, option] of Object.entries(baseOptions)) {
      if (key === 'channel' && !launchesByChannel) {
        continue;
      }
      if (resolvedArgs[key] === undefined && 'default' in option) {
        resolvedArgs[key] = option.default;
      }
    }

    if (isViaCli) {
      if (resolvedArgs.filesystemRoot === DEFAULT_FILESYSTEM_ROOT) {
        resolvedArgs.allowUnrestrictedPaths = true;
        resolvedArgs.filesystemRoot = undefined;
      }
      const connectsToExistingBrowser =
        resolvedArgs.autoConnect ||
        resolvedArgs.browserUrl ||
        resolvedArgs.wsEndpoint;
      if (
        (explicitArgs as Record<string, unknown>).isolated === undefined &&
        resolvedArgs.userDataDir === undefined &&
        !connectsToExistingBrowser
      ) {
        resolvedArgs.isolated = true;
      }
      if (
        resolvedArgs.categoryExtensions === undefined &&
        !connectsToExistingBrowser
      ) {
        resolvedArgs.categoryExtensions = true;
      }
    }

    if (this.env['CI'] || this.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS']) {
      console.error(
        "turning off usage statistics. process.env['CI'] || process.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS'] is set.",
      );
      resolvedArgs.usageStatistics = false;
    }

    return resolvedArgs as unknown as ParsedArguments;
  }

  parse(): ParsedArguments {
    try {
      const cliArgs = this.parseCliArgs();
      const configFileArgs =
        typeof (cliArgs as Record<string, unknown>).config === 'string'
          ? this.parseConfigFile(
              (cliArgs as Record<string, unknown>).config as string,
            )
          : {};
      const explicitArgs = {...configFileArgs, ...cliArgs};
      this.warnUnknownArgs(cliArgs);
      this.validateConflicts(explicitArgs);
      this.validateImplications(explicitArgs);
      const resolvedArgs = this.applyDefaults(explicitArgs);

      return resolvedArgs;
    } catch (error) {
      if (this.exitProcess) {
        console.error(getErrorMessage(error));
        process.exit(1);
      }
      throw error;
    }
  }
}
