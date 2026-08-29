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
  resolveCliStartArgs,
} from '../src/config/cli-config.js';

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

  it('falls back to the home config directory when XDG_CONFIG_HOME is empty', () => {
    assert.strictEqual(
      getCliConfigPath({XDG_CONFIG_HOME: ''}, '/tmp/home-directory'),
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

  it('rejects unknown start options in the config', () => {
    assert.throws(
      () => resolveCliStartArgs([], {notAStartOption: true}),
      /Unknown argument/,
    );
  });

  it('reuses start option validation for config values', () => {
    assert.throws(
      () => resolveCliStartArgs([], {browserUrl: 'not-a-url'}),
      /not valid URL/,
    );
  });
});

describe('Chrome DevTools CLI start arg precedence', () => {
  it('serializes configured start options for automatic daemon startup', () => {
    const args = resolveCliStartArgs([], {
      executablePath: '/usr/bin/chromium',
      headless: false,
    });

    assert.ok(args.includes('--executable-path=/usr/bin/chromium'));
    assert.ok(args.includes('--no-headless'));
    assert.ok(!args.includes('--headless'));
  });

  it('lets command-line options override configuration values', () => {
    const args = resolveCliStartArgs(['--headless=true'], {headless: false});

    assert.ok(args.includes('--headless'));
    assert.ok(!args.includes('--no-headless'));
  });

  it('lets configuration values override built-in defaults', () => {
    const defaultArgs = resolveCliStartArgs([]);
    assert.ok(defaultArgs.includes('--headless'));
    assert.ok(defaultArgs.includes('--isolated'));

    const configuredArgs = resolveCliStartArgs([], {
      headless: false,
      isolated: false,
    });
    assert.ok(configuredArgs.includes('--no-headless'));
    assert.ok(configuredArgs.includes('--no-isolated'));
    assert.ok(!configuredArgs.includes('--headless'));
    assert.ok(!configuredArgs.includes('--isolated'));
  });

  it('does not enable isolated when userDataDir is configured', () => {
    const args = resolveCliStartArgs([], {userDataDir: '/tmp/chrome-profile'});

    assert.ok(args.includes('--user-data-dir=/tmp/chrome-profile'));
    assert.ok(!args.includes('--isolated'));
  });
});
