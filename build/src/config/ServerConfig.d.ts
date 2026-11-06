/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type ParsedArguments } from './mcp-options.js';
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
export declare class ServerConfig implements ReadonlyServerConfig {
    #private;
    constructor(init: ServerConfigInit);
    /**
     * Step 4: rejects mutually exclusive inputs. Only explicit inputs are
     * checked, so defaults never conflict.
     */
    static validateConflicts(explicitArgs: Partial<ParsedArguments>): void;
    static validateImplications(explicitArgs: Partial<ParsedArguments>): void;
    /**
     * Step 5: fills in defaults for everything that was not set explicitly.
     * `viaCli` is an explicit input like any other; it selects which defaults
     * apply.
     */
    static applyDefaults(explicitArgs: Partial<ParsedArguments>, options?: {
        env?: NodeJS.ProcessEnv;
        suppressUsageStatisticsNotice?: boolean;
    }): ParsedArguments;
    /**
     * Step 3–5: merges CLI and config-file layers (`CLI > config file`),
     * validates conflicts and implications, and applies defaults.
     */
    static create(options: ServerConfigCreateOptions): ServerConfig;
    get cliArgs(): Readonly<Partial<ParsedArguments>>;
    get fileArgs(): Readonly<Partial<ParsedArguments>>;
    get configPath(): string | undefined;
    get resolved(): Readonly<ParsedArguments>;
    /**
     * Produces a new {@link ServerConfig} with updated config-file arguments,
     * preserving this config's CLI arguments, config path, and environment.
     */
    withFileArgs(fileArgs: Partial<ParsedArguments>): ServerConfig;
    /**
     * Produces a new {@link ServerConfig} that takes reloadable options from
     * `next` and keeps restart-required options from this config, preserving
     * `CLI > config file > defaults` precedence.
     */
    mergeReloadable(next: ServerConfig, options?: {
        env?: NodeJS.ProcessEnv;
    }): ServerConfig;
    /**
     * Returns the restart-required options whose resolved values differ between
     * this config and `next`.
     */
    getRestartRequiredChanges(next: ServerConfig): Array<keyof ParsedArguments>;
    /**
     * Commits a previously validated {@link ServerConfig} snapshot in place so
     * all shared {@link ReadonlyServerConfig} readers observe the new values.
     */
    commit(next: ServerConfig): void;
}
