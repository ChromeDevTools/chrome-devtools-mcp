/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_FILE_NAME = 'cd4a.config.json';

/**
 * Turns off config file discovery, for example in tests. A config file passed
 * via `--config` is still used.
 */
export const NO_CONFIG_DISCOVERY_ENV =
  'CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY';

export interface ConfigLocatorOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  homedir: string;
  isFile: (filePath: string) => boolean;
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath, {throwIfNoEntry: false})?.isFile() ?? false;
  } catch {
    return false;
  }
}

/**
 * Finds the config file in the predefined locations. The first existing file
 * wins, config files are not merged.
 *
 * Locations, from highest to lowest priority:
 * 1. `${CWD}/cd4a.config.json`
 * 2. `${PLUGIN_DATA}/cd4a.config.json`
 * 3. The global config: `$XDG_CONFIG_HOME/cd4a/config.json` on macOS and
 *    Linux, `%LOCALAPPDATA%/Google/cd4a/config.json` on Windows, with a
 *    fallback to `~/.config/cd4a/config.json`.
 *
 * An explicit `--config` takes precedence over all of them and is handled by
 * the ConfigParser. Discovery is turned off if the
 * `CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY` env variable is set.
 */
export class ConfigLocator {
  readonly #options: ConfigLocatorOptions;

  constructor(options: Partial<ConfigLocatorOptions> = {}) {
    this.#options = {
      cwd: process.cwd(),
      env: process.env,
      platform: process.platform,
      homedir: os.homedir(),
      isFile,
      ...options,
    };
  }

  getSearchPaths(): string[] {
    const {cwd, env} = this.#options;
    const searchPaths = [path.join(cwd, CONFIG_FILE_NAME)];
    const pluginData = env['PLUGIN_DATA'];
    if (pluginData) {
      searchPaths.push(path.join(pluginData, CONFIG_FILE_NAME));
    }
    searchPaths.push(this.getGlobalConfigPath());
    return searchPaths;
  }

  getGlobalConfigPath(): string {
    const {env, platform, homedir} = this.#options;
    if (platform === 'win32') {
      const localAppData = env['LOCALAPPDATA'];
      if (localAppData) {
        return path.join(localAppData, 'Google', 'cd4a', 'config.json');
      }
    } else {
      // Per the XDG Base Directory spec, relative paths must be ignored.
      const xdgConfigHome = env['XDG_CONFIG_HOME'];
      if (xdgConfigHome && path.isAbsolute(xdgConfigHome)) {
        return path.join(xdgConfigHome, 'cd4a', 'config.json');
      }
    }
    return path.join(homedir, '.config', 'cd4a', 'config.json');
  }

  locate(): string | undefined {
    if (this.#options.env[NO_CONFIG_DISCOVERY_ENV]) {
      return undefined;
    }
    return this.getSearchPaths().find(filePath =>
      this.#options.isFile(filePath),
    );
  }
}
