/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import {
  getCliConfigPath,
  readCliConfig,
} from '../src/bin/chrome-devtools-cli-config.js';

describe('Chrome DevTools CLI config', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, {recursive: true, force: true});
    }
    temporaryDirectories.length = 0;
  });

  function createTemporaryDirectory(): string {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'chrome-devtools-cli-config-test-'),
    );
    temporaryDirectories.push(directory);
    return directory;
  }

  it('uses XDG_CONFIG_HOME when set', () => {
    assert.strictEqual(
      getCliConfigPath(
        {XDG_CONFIG_HOME: '/tmp/xdg-config'},
        '/tmp/home-directory',
      ),
      path.join('/tmp/xdg-config', 'chrome-devtools', 'config.json'),
    );
  });

  it('falls back to the home config directory', () => {
    assert.strictEqual(
      getCliConfigPath({}, '/tmp/home-directory'),
      path.join(
        '/tmp/home-directory',
        '.config',
        'chrome-devtools',
        'config.json',
      ),
    );
  });

  it('returns an empty config when the file does not exist', () => {
    const configPath = path.join(createTemporaryDirectory(), 'config.json');
    assert.deepStrictEqual(readCliConfig(configPath), {});
  });

  it('reads a JSON config object', () => {
    const configPath = path.join(createTemporaryDirectory(), 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({executablePath: '/usr/bin/chromium', headless: false}),
    );

    assert.deepStrictEqual(readCliConfig(configPath), {
      executablePath: '/usr/bin/chromium',
      headless: false,
    });
  });

  it('rejects invalid JSON', () => {
    const configPath = path.join(createTemporaryDirectory(), 'config.json');
    fs.writeFileSync(configPath, '{');

    assert.throws(
      () => readCliConfig(configPath),
      /Failed to parse Chrome DevTools CLI config/,
    );
  });

  it('rejects a non-object config', () => {
    const configPath = path.join(createTemporaryDirectory(), 'config.json');
    fs.writeFileSync(configPath, '[]');

    assert.throws(
      () => readCliConfig(configPath),
      /must contain a JSON object/,
    );
  });
});
