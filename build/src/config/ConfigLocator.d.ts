/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const CONFIG_FILE_NAME = "cd4a.config.json";
/**
 * Turns off config file discovery, for example in tests. A config file passed
 * via `--config` is still used.
 */
export declare const NO_CONFIG_DISCOVERY_ENV = "CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY";
/**
 * Finds the config file in the predefined locations. The first existing file
 * wins, config files are not merged.
 *
 * Locations, from highest to lowest priority:
 * 1. `${PLUGIN_DATA}/cd4a.config.json`
 * 2. The global config: `$XDG_CONFIG_HOME/cd4a/config.json` on macOS and
 *    Linux, `%LOCALAPPDATA%/Google/cd4a/config.json` on Windows, with a
 *    fallback to `~/.config/cd4a/config.json`.
 *
 * An explicit `--config` takes precedence over all of them and is handled by
 * the ConfigParser. Discovery is turned off if the
 * `CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY` env variable is set.
 */
export declare class ConfigLocator {
    getSearchPaths(env?: NodeJS.ProcessEnv): string[];
    getGlobalConfigPath(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, homedir?: string): string;
    locate(env?: NodeJS.ProcessEnv, checkIsFile?: (filePath: string) => boolean): string | undefined;
}
