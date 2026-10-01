/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {ConfigLocator} from '../../src/config/ConfigLocator.js';

const HOME = path.resolve('/home/user');
const CWD = path.resolve('/work/project');
const PLUGIN_DATA = path.resolve('/plugins/data/chrome-devtools');
const XDG_CONFIG_HOME = path.resolve('/xdg/config');

const CWD_CONFIG = path.join(CWD, 'cd4a.config.json');
const PLUGIN_CONFIG = path.join(PLUGIN_DATA, 'cd4a.config.json');
const XDG_CONFIG = path.join(XDG_CONFIG_HOME, 'cd4a', 'config.json');
const HOME_CONFIG = path.join(HOME, '.config', 'cd4a', 'config.json');

class TestConfigLocator extends ConfigLocator {
  #files: Set<string>;
  #env: NodeJS.ProcessEnv;
  #platform: NodeJS.Platform;

  constructor(
    existingFiles: string[],
    env: NodeJS.ProcessEnv = {},
    platform: NodeJS.Platform = 'linux',
  ) {
    super();
    this.#files = new Set(existingFiles);
    this.#env = env;
    this.#platform = platform;
  }

  override getSearchPaths(cwd = CWD, env = this.#env): string[] {
    return super.getSearchPaths(cwd, env);
  }

  override getGlobalConfigPath(
    env = this.#env,
    platform = this.#platform,
    homedir = HOME,
  ): string {
    return super.getGlobalConfigPath(env, platform, homedir);
  }

  override locate(
    env = this.#env,
    checkIsFile = (filePath: string) => this.#files.has(filePath),
  ): string | undefined {
    return super.locate(env, checkIsFile);
  }
}

describe('ConfigLocator', () => {
  describe('getGlobalConfigPath', () => {
    it('falls back to ~/.config on Linux and macOS', () => {
      for (const platform of ['linux', 'darwin'] as const) {
        assert.strictEqual(
          new TestConfigLocator([], {}, platform).getGlobalConfigPath(),
          HOME_CONFIG,
        );
      }
    });

    it('respects XDG_CONFIG_HOME', () => {
      assert.strictEqual(
        new TestConfigLocator([], {XDG_CONFIG_HOME}).getGlobalConfigPath(),
        XDG_CONFIG,
      );
    });

    it('ignores a relative XDG_CONFIG_HOME', () => {
      assert.strictEqual(
        new TestConfigLocator([], {
          XDG_CONFIG_HOME: 'relative',
        }).getGlobalConfigPath(),
        HOME_CONFIG,
      );
    });

    it('uses LOCALAPPDATA on Windows', () => {
      const localAppData = path.resolve('/AppData/Local');
      assert.strictEqual(
        new TestConfigLocator(
          [],
          {LOCALAPPDATA: localAppData},
          'win32',
        ).getGlobalConfigPath(),
        path.join(localAppData, 'Google', 'cd4a', 'config.json'),
      );
    });

    it('falls back to ~/.config on Windows without LOCALAPPDATA', () => {
      assert.strictEqual(
        new TestConfigLocator([], {}, 'win32').getGlobalConfigPath(),
        HOME_CONFIG,
      );
    });
  });

  describe('locate', () => {
    it('returns undefined when no config file exists', () => {
      assert.strictEqual(
        new TestConfigLocator([], {PLUGIN_DATA}).locate(),
        undefined,
      );
    });

    it('returns undefined when discovery is turned off', () => {
      assert.strictEqual(
        new TestConfigLocator([CWD_CONFIG, PLUGIN_CONFIG, HOME_CONFIG], {
          PLUGIN_DATA,
          CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY: 'true',
        }).locate(),
        undefined,
      );
    });

    it('prefers the config file in the current working directory', () => {
      assert.strictEqual(
        new TestConfigLocator([CWD_CONFIG, PLUGIN_CONFIG, HOME_CONFIG], {
          PLUGIN_DATA,
        }).locate(),
        CWD_CONFIG,
      );
    });

    it('prefers the plugin data config over the global config', () => {
      assert.strictEqual(
        new TestConfigLocator([PLUGIN_CONFIG, HOME_CONFIG], {
          PLUGIN_DATA,
        }).locate(),
        PLUGIN_CONFIG,
      );
    });

    it('skips the plugin data config when PLUGIN_DATA is not set', () => {
      assert.strictEqual(
        new TestConfigLocator([PLUGIN_CONFIG, HOME_CONFIG]).locate(),
        HOME_CONFIG,
      );
    });

    it('does not use ~/.config when XDG_CONFIG_HOME is set', () => {
      assert.strictEqual(
        new TestConfigLocator([HOME_CONFIG], {XDG_CONFIG_HOME}).locate(),
        undefined,
      );
    });
  });
});
