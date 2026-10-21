/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFileSync} from 'node:fs';

import type {Argv} from 'yargs';

import type {YargsOptions, InferredOptionTypes} from '../third_party/cli.js';
import {yargs, hideBin} from '../third_party/cli.js';
import {getErrorMessage} from '../utils/errorHandling.js';

import {ConfigLocator} from './ConfigLocator.js';
import {
  mcpOptions,
  CLI_EXAMPLES,
  stripYargsPositionalArgs,
  withoutDefaults,
} from './mcp-options.js';
import type {ParsedArguments} from './ServerConfig.js';
import {ServerConfig} from './ServerConfig.js';

export type {ParsedArguments} from './ServerConfig.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ConfigParser {
  #configPath?: string;
  #cliArgs?: Partial<ParsedArguments>;
  #usageStatisticsNoticeShown = false;
  readonly configLocator: ConfigLocator;

  constructor(
    private version: string,
    private argv: string[] = process.argv,
    private env: NodeJS.ProcessEnv = process.env,
    private exitProcess = true,
    configLocator?: ConfigLocator,
  ) {
    this.configLocator = configLocator ?? new ConfigLocator();
  }

  /**
   * The config file resolved by the last `parse()` call, if any.
   */
  get configPath(): string | undefined {
    return this.#configPath;
  }

  buildCliParser(
    options: Record<string, YargsOptions> = mcpOptions,
  ): Argv<InferredOptionTypes<Record<string, YargsOptions>>> {
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

  /**
   * Step 1: parses the CLI flags without applying defaults, so the result only
   * contains what the user passed. `--help` and `--version` print and exit the
   * process; parse errors throw.
   */
  parseCliArgs(): Partial<ParsedArguments> {
    const parsed = this.buildCliParser(withoutDefaults(mcpOptions))
      .fail(false)
      .parseSync();
    return stripYargsPositionalArgs(parsed);
  }

  /**
   * Step 2: reads the JSON config file and runs it through yargs to reject
   * unknown keys and apply coercions, without applying defaults.
   */
  static parseConfigFile(
    configPath: string,
    rawContent?: string,
  ): Partial<ParsedArguments> {
    try {
      const fileContent: unknown = JSON.parse(
        rawContent ?? readFileSync(configPath, 'utf-8'),
      );
      if (!isPlainObject(fileContent)) {
        throw new Error('Config must be a JSON object');
      }
      const configOptions = withoutDefaults(mcpOptions);
      delete configOptions.config;
      const parsed = yargs([])
        .parserConfiguration({
          'strip-aliased': true,
          'camel-case-expansion': false,
        })
        .options(configOptions)
        .help(false)
        .version(false)
        .config(fileContent)
        .strict()
        .fail(false)
        .exitProcess(false)
        .parseSync([]);
      return stripYargsPositionalArgs(parsed);
    } catch (err) {
      throw new Error(`Invalid JSON config file: ${getErrorMessage(err)}`);
    }
  }

  parseConfigFile(
    configPath: string,
    rawContent?: string,
  ): Partial<ParsedArguments> {
    return ConfigParser.parseConfigFile(configPath, rawContent);
  }

  warnUnknownArgs(cliArgs: Partial<ParsedArguments>): void {
    const allowedArgs = new Set(Object.keys(mcpOptions));
    const unknownArgs = Object.keys(cliArgs).filter(
      arg => !allowedArgs.has(arg),
    );
    if (unknownArgs.length > 0) {
      console.error(`Unknown arguments: ${unknownArgs.map(arg => `--${arg}`)}`);
    }
  }

  /**
   * Parses CLI arguments and the config file into a layered
   * {@link ServerConfig}.
   */
  parseConfig(): ServerConfig {
    try {
      const cliArgs = this.parseCliArgs();
      this.#cliArgs = cliArgs;
      this.#configPath = cliArgs.config ?? this.configLocator.locate(this.env);
      this.warnUnknownArgs(cliArgs);
      return this.#resolveConfig(cliArgs);
    } catch (error) {
      if (this.exitProcess) {
        console.error(getErrorMessage(error));
        process.exit(1);
      }
      throw error;
    }
  }

  parse(): ParsedArguments {
    return this.parseConfig().resolved;
  }

  /**
   * Re-reads the config file resolved by `parse()` and merges it with the CLI
   * arguments again into a new {@link ServerConfig}. Unlike `parseConfig()`, it
   * does not discover a new config file and throws on invalid configuration
   * instead of exiting the process.
   */
  reloadConfig(): ServerConfig {
    this.#cliArgs ??= this.parseCliArgs();
    return this.#resolveConfig(this.#cliArgs);
  }

  /**
   * Re-reads the config file resolved by `parse()` and merges it with the CLI
   * arguments again. Unlike `parse()`, it does not discover a new config file
   * and throws on invalid configuration instead of exiting the process.
   */
  reload(): ParsedArguments {
    return this.reloadConfig().resolved;
  }

  #resolveConfig(cliArgs: Partial<ParsedArguments>): ServerConfig {
    const configPath = this.#configPath;
    const fileArgs = configPath ? this.parseConfigFile(configPath) : {};
    const config = ServerConfig.create({
      cliArgs,
      fileArgs,
      configPath,
      env: this.env,
      suppressUsageStatisticsNotice: this.#usageStatisticsNoticeShown,
    });
    this.#usageStatisticsNoticeShown = true;
    return config;
  }
}
