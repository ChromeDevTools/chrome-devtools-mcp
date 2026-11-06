/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Argv } from 'yargs';
import { type YargsOptions, type InferredOptionTypes } from '../third_party/cli.js';
import { ConfigLocator } from './ConfigLocator.js';
import { type ParsedArguments } from './mcp-options.js';
import { ServerConfig } from './ServerConfig.js';
export declare class ConfigParser {
    #private;
    private version;
    private argv;
    private env;
    private exitProcess;
    readonly configLocator: ConfigLocator;
    constructor(version: string, argv?: string[], env?: NodeJS.ProcessEnv, exitProcess?: boolean, configLocator?: ConfigLocator);
    /**
     * The config file resolved by the last `parse()` call, if any.
     */
    get configPath(): string | undefined;
    buildCliParser(options?: Record<string, YargsOptions>): Argv<InferredOptionTypes<Record<string, YargsOptions>>>;
    /**
     * Step 1: parses the CLI flags without applying defaults, so the result only
     * contains what the user passed. `--help` and `--version` print and exit the
     * process; parse errors throw.
     */
    parseCliArgs(): Partial<ParsedArguments>;
    /**
     * Step 2: reads the JSON config file and runs it through yargs to reject
     * unknown keys and apply coercions, without applying defaults.
     */
    static parseConfigFile(configPath: string, rawContent?: string): Partial<ParsedArguments>;
    parseConfigFile(configPath: string, rawContent?: string): Partial<ParsedArguments>;
    warnUnknownArgs(cliArgs: Partial<ParsedArguments>): void;
    /**
     * Parses CLI arguments and the config file into a layered
     * {@link ServerConfig}.
     */
    parseConfig(): ServerConfig;
    parse(): ParsedArguments;
    /**
     * Re-reads the config file resolved by `parse()` and merges it with the CLI
     * arguments again into a new {@link ServerConfig}. Unlike `parseConfig()`, it
     * does not discover a new config file and throws on invalid configuration
     * instead of exiting the process.
     */
    reloadConfig(): ServerConfig;
    /**
     * Re-reads the config file resolved by `parse()` and merges it with the CLI
     * arguments again. Unlike `parse()`, it does not discover a new config file
     * and throws on invalid configuration instead of exiting the process.
     */
    reload(): ParsedArguments;
}
