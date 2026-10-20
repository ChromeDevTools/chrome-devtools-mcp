/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {isDeepStrictEqual} from 'node:util';

import type {InferredOptionTypes} from '../third_party/cli.js';
import {yargs} from '../third_party/cli.js';

import {
  CONFLICTING_ARGS,
  DEFAULT_FILESYSTEM_ROOT,
  IMPLICATIONS,
  isReloadableOption,
  mcpOptions,
  mcpOptionsForViaCli,
  stripYargsPositionalArgs,
} from './mcp-options.js';

type InferredMcpArguments = InferredOptionTypes<typeof mcpOptions>;

export type ParsedArguments = Omit<
  InferredMcpArguments,
  'channel' | 'filesystemRoot'
> & {
  channel?: InferredMcpArguments['channel'];
  filesystemRoot?: InferredMcpArguments['filesystemRoot'];
};

function isMcpOptionKey(key: string): key is keyof ParsedArguments {
  return key in mcpOptions;
}

function copyOption<K extends keyof ParsedArguments>(
  target: Partial<ParsedArguments>,
  source: Partial<ParsedArguments>,
  key: K,
): void {
  if (key in source) {
    target[key] = source[key];
  } else {
    delete target[key];
  }
}

function filterExplicitArgs(
  args: Partial<ParsedArguments>,
  baseOptions: typeof mcpOptions | typeof mcpOptionsForViaCli,
): Partial<ParsedArguments> {
  const filtered: Partial<ParsedArguments> = {};
  for (const key of Object.keys(args)) {
    if (!isMcpOptionKey(key)) {
      continue;
    }
    if (args[key] === undefined && 'default' in baseOptions[key]) {
      continue;
    }
    copyOption(filtered, args, key);
  }
  return filtered;
}

function mergeLayer(
  previous: Readonly<Partial<ParsedArguments>>,
  next: Readonly<Partial<ParsedArguments>>,
): Partial<ParsedArguments> {
  const merged: Partial<ParsedArguments> = {...previous};
  for (const name of Object.keys(mcpOptions)) {
    if (isMcpOptionKey(name) && isReloadableOption(name)) {
      copyOption(merged, next, name);
    }
  }
  return merged;
}

function parseDefaultArgs(
  options: typeof mcpOptions | typeof mcpOptionsForViaCli,
): ParsedArguments {
  const parsed = yargs([])
    .parserConfiguration({
      'strip-aliased': true,
      'camel-case-expansion': false,
    })
    .options(options)
    .parseSync([]);
  return {
    ...stripYargsPositionalArgs(parsed),
    // yargs copies array defaults, so restore the shared reference that the
    // `viaCli` check in `applyDefaults()` compares with `===`.
    filesystemRoot: DEFAULT_FILESYSTEM_ROOT,
  };
}

export interface ReadonlyServerConfig {
  readonly resolved: Readonly<ParsedArguments>;
}

export interface ServerConfigInit {
  cliArgs: Partial<ParsedArguments>;
  fileArgs: Partial<ParsedArguments>;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  resolved: ParsedArguments;
}

export interface ServerConfigCreateOptions {
  cliArgs: Partial<ParsedArguments>;
  fileArgs: Partial<ParsedArguments>;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  suppressUsageStatisticsNotice?: boolean;
}

/**
 * Holds explicit CLI and config-file layers alongside the resolved arguments.
 *
 * Components read live configuration through {@link ReadonlyServerConfig}.
 * Only the owning server updates the config in place via {@link commit} after
 * computing and validating a candidate reload via {@link mergeReloadable}.
 */
export class ServerConfig implements ReadonlyServerConfig {
  #cliArgs: Readonly<Partial<ParsedArguments>>;
  #fileArgs: Readonly<Partial<ParsedArguments>>;
  readonly #configPath?: string;
  readonly #env: NodeJS.ProcessEnv;
  #resolved: Readonly<ParsedArguments>;

  constructor(init: ServerConfigInit) {
    this.#cliArgs = {...init.cliArgs};
    this.#fileArgs = {...init.fileArgs};
    this.#configPath = init.configPath;
    this.#env = init.env ?? process.env;
    this.#resolved = {...init.resolved};
  }

  /**
   * Step 4: rejects mutually exclusive inputs. Only explicit inputs are
   * checked, so defaults never conflict.
   */
  static validateConflicts(explicitArgs: Partial<ParsedArguments>): void {
    const activeArgs = new Set<string>();
    for (const [key, val] of Object.entries(explicitArgs)) {
      if (val !== undefined && val !== false) {
        activeArgs.add(key);
      }
    }
    for (const group of CONFLICTING_ARGS) {
      const activeInGroup = group.filter(arg => activeArgs.has(arg));
      if (activeInGroup.length > 1) {
        const [arg1, arg2] = activeInGroup;
        throw new Error(
          `Arguments ${String(arg1)} and ${String(arg2)} are mutually exclusive`,
        );
      }
    }
  }

  static validateImplications(explicitArgs: Partial<ParsedArguments>): void {
    for (const [key, implied] of IMPLICATIONS) {
      const isKeySet =
        explicitArgs[key] !== undefined && explicitArgs[key] !== false;
      const isImpliedSet =
        explicitArgs[implied] !== undefined && explicitArgs[implied] !== false;
      if (isKeySet && !isImpliedSet) {
        throw new Error(
          `Implications failed:\n  ${String(key)} -> ${String(implied)}`,
        );
      }
    }
  }

  /**
   * Step 5: fills in defaults for everything that was not set explicitly.
   * `viaCli` is an explicit input like any other; it selects which defaults
   * apply.
   */
  static applyDefaults(
    explicitArgs: Partial<ParsedArguments>,
    options?: {
      env?: NodeJS.ProcessEnv;
      suppressUsageStatisticsNotice?: boolean;
    },
  ): ParsedArguments {
    const env = options?.env ?? process.env;
    const isViaCli = explicitArgs.viaCli === true;
    const baseOptions = isViaCli ? mcpOptionsForViaCli : mcpOptions;
    const resolvedArgs: ParsedArguments = {
      ...parseDefaultArgs(baseOptions),
      ...filterExplicitArgs(explicitArgs, baseOptions),
    };

    // `channel` only applies when Chrome is launched by channel. Leaving it
    // unset otherwise keeps it out of telemetry (computeFlagUsage).
    const launchesByChannel =
      !resolvedArgs.browserUrl &&
      !resolvedArgs.wsEndpoint &&
      !resolvedArgs.executablePath;
    if (!launchesByChannel && explicitArgs.channel === undefined) {
      delete resolvedArgs.channel;
    }

    if (isViaCli) {
      if (
        resolvedArgs.filesystemRoot === DEFAULT_FILESYSTEM_ROOT &&
        explicitArgs.allowUnrestrictedPaths !== false
      ) {
        resolvedArgs.allowUnrestrictedPaths = true;
        resolvedArgs.filesystemRoot = undefined;
      }
      const connectsToExistingBrowser =
        resolvedArgs.autoConnect ||
        resolvedArgs.browserUrl ||
        resolvedArgs.wsEndpoint;
      if (
        explicitArgs.isolated === undefined &&
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

    if (env['CI'] || env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS']) {
      if (!options?.suppressUsageStatisticsNotice) {
        console.error(
          "turning off usage statistics. process.env['CI'] || process.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS'] is set.",
        );
      }
      resolvedArgs.usageStatistics = false;
    }

    if (
      resolvedArgs.categoryExperimentalThirdParty === undefined &&
      env['CHROME_DEVTOOLS_MCP_CATEGORY_EXPERIMENTAL_THIRD_PARTY']
    ) {
      resolvedArgs.categoryExperimentalThirdParty = true;
    }

    return resolvedArgs;
  }

  /**
   * Step 3–5: merges CLI and config-file layers (`CLI > config file`),
   * validates conflicts and implications, and applies defaults.
   */
  static create(options: ServerConfigCreateOptions): ServerConfig {
    const explicitArgs: Partial<ParsedArguments> = {
      ...options.fileArgs,
      ...options.cliArgs,
      ...(options.configPath ? {config: options.configPath} : {}),
    };
    ServerConfig.validateConflicts(explicitArgs);
    ServerConfig.validateImplications(explicitArgs);
    const resolved = ServerConfig.applyDefaults(explicitArgs, {
      env: options.env,
      suppressUsageStatisticsNotice: options.suppressUsageStatisticsNotice,
    });
    return new ServerConfig({
      cliArgs: options.cliArgs,
      fileArgs: options.fileArgs,
      configPath: options.configPath,
      env: options.env,
      resolved,
    });
  }

  get cliArgs(): Readonly<Partial<ParsedArguments>> {
    return this.#cliArgs;
  }

  get fileArgs(): Readonly<Partial<ParsedArguments>> {
    return this.#fileArgs;
  }

  get configPath(): string | undefined {
    return this.#configPath;
  }

  get resolved(): Readonly<ParsedArguments> {
    return this.#resolved;
  }

  /**
   * Produces a new {@link ServerConfig} that takes reloadable options from
   * `next` and keeps restart-required options from this config, preserving
   * `CLI > config file > defaults` precedence.
   */
  mergeReloadable(
    next: ServerConfig,
    options?: {env?: NodeJS.ProcessEnv},
  ): ServerConfig {
    const mergedFileArgs = mergeLayer(this.#fileArgs, next.#fileArgs);
    const mergedCliArgs = mergeLayer(this.#cliArgs, next.#cliArgs);
    return ServerConfig.create({
      cliArgs: mergedCliArgs,
      fileArgs: mergedFileArgs,
      configPath: this.#configPath,
      env: options?.env ?? this.#env,
      suppressUsageStatisticsNotice: true,
    });
  }

  /**
   * Returns the restart-required options whose resolved values differ between
   * this config and `next`.
   */
  getRestartRequiredChanges(next: ServerConfig): Array<keyof ParsedArguments> {
    const changed: Array<keyof ParsedArguments> = [];
    for (const name of Object.keys(mcpOptions)) {
      if (
        isMcpOptionKey(name) &&
        !isReloadableOption(name) &&
        (!isDeepStrictEqual(this.#fileArgs[name], next.#fileArgs[name]) ||
          !isDeepStrictEqual(this.#cliArgs[name], next.#cliArgs[name])) &&
        !isDeepStrictEqual(this.#resolved[name], next.#resolved[name])
      ) {
        changed.push(name);
      }
    }
    return changed;
  }

  /**
   * Commits a previously validated {@link ServerConfig} snapshot in place so
   * all shared {@link ReadonlyServerConfig} readers observe the new values.
   */
  commit(next: ServerConfig): void {
    this.#cliArgs = next.#cliArgs;
    this.#fileArgs = next.#fileArgs;
    this.#resolved = next.#resolved;
  }
}
