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

function createLocator(
  existingFiles: string[],
  env: NodeJS.ProcessEnv = {},
  platform: NodeJS.Platform = 'linux',
) {
  const files = new Set(existingFiles);
  return new ConfigLocator({
    cwd: CWD,
    env,
    platform,
    homedir: HOME,
    isFile: filePath => files.has(filePath),
  });
}

describe('ConfigLocator', () => {
  describe('getGlobalConfigPath', () => {
    it('falls back to ~/.config on Linux and macOS', () => {
      for (const platform of ['linux', 'darwin'] as const) {
        assert.strictEqual(
          createLocator([], {}, platform).getGlobalConfigPath(),
          HOME_CONFIG,
        );
      }
    });

    it('respects XDG_CONFIG_HOME', () => {
      assert.strictEqual(
        createLocator([], {XDG_CONFIG_HOME}).getGlobalConfigPath(),
        XDG_CONFIG,
      );
    });

    it('ignores a relative XDG_CONFIG_HOME', () => {
      assert.strictEqual(
        createLocator([], {XDG_CONFIG_HOME: 'relative'}).getGlobalConfigPath(),
        HOME_CONFIG,
      );
    });

    it('uses LOCALAPPDATA on Windows', () => {
      const localAppData = path.resolve('/AppData/Local');
      assert.strictEqual(
        createLocator(
          [],
          {LOCALAPPDATA: localAppData},
          'win32',
        ).getGlobalConfigPath(),
        path.join(localAppData, 'Google', 'cd4a', 'config.json'),
      );
    });

    it('falls back to ~/.config on Windows without LOCALAPPDATA', () => {
      assert.strictEqual(
        createLocator([], {}, 'win32').getGlobalConfigPath(),
        HOME_CONFIG,
      );
    });
  });

  describe('locate', () => {
    it('returns undefined when no config file exists', () => {
      assert.strictEqual(createLocator([], {PLUGIN_DATA}).locate(), undefined);
    });

    it('prefers the config file in the current working directory', () => {
      assert.strictEqual(
        createLocator([CWD_CONFIG, PLUGIN_CONFIG, HOME_CONFIG], {
          PLUGIN_DATA,
        }).locate(),
        CWD_CONFIG,
      );
    });

    it('prefers the plugin data config over the global config', () => {
      assert.strictEqual(
        createLocator([PLUGIN_CONFIG, HOME_CONFIG], {PLUGIN_DATA}).locate(),
        PLUGIN_CONFIG,
      );
    });

    it('skips the plugin data config when PLUGIN_DATA is not set', () => {
      assert.strictEqual(
        createLocator([PLUGIN_CONFIG, HOME_CONFIG]).locate(),
        HOME_CONFIG,
      );
    });

    it('does not use ~/.config when XDG_CONFIG_HOME is set', () => {
      assert.strictEqual(
        createLocator([HOME_CONFIG], {XDG_CONFIG_HOME}).locate(),
        undefined,
      );
    });
  });
});
