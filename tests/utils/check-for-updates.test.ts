/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import {
  checkForUpdates,
  resetUpdateCheckFlagForTesting,
} from '../../src/utils/check-for-updates.js';
import {VERSION} from '../../src/version.js';

const NO_UPDATE_CHECKS_ENV = 'CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS';
const NEWER_VERSION = '999.999.999';

describe('checkForUpdates', () => {
  let tmpHome: string;
  let savedEnv: string | undefined;
  let warnings: string[];
  let spawnCalls: Array<{
    command: string;
    args: string[];
    options: childProcess.SpawnOptions;
  }>;

  function cachePath(): string {
    return path.join(tmpHome, '.cache', 'chrome-devtools-mcp', 'latest.json');
  }

  async function writeCache(content: string): Promise<void> {
    await fs.mkdir(path.dirname(cachePath()), {recursive: true});
    await fs.writeFile(cachePath(), content);
  }

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(
      path.join(os.tmpdir(), 'check-for-updates-test-'),
    );
    // The test runner sets this variable globally, but these tests need to
    // exercise the code paths behind the early return.
    savedEnv = process.env[NO_UPDATE_CHECKS_ENV];
    delete process.env[NO_UPDATE_CHECKS_ENV];
    resetUpdateCheckFlagForTesting();
    warnings = [];
    spawnCalls = [];
    mock.method(os, 'homedir', () => tmpHome);
    mock.method(console, 'warn', (message: string) => {
      warnings.push(String(message));
    });
    mock.method(
      childProcess,
      'spawn',
      (command: string, args: string[], options: childProcess.SpawnOptions) => {
        spawnCalls.push({command, args, options});
        return {
          unref() {
            // No-op for tests.
          },
        } as unknown as childProcess.ChildProcess;
      },
    );
  });

  afterEach(async () => {
    mock.restoreAll();
    if (savedEnv === undefined) {
      delete process.env[NO_UPDATE_CHECKS_ENV];
    } else {
      process.env[NO_UPDATE_CHECKS_ENV] = savedEnv;
    }
    resetUpdateCheckFlagForTesting();
    await fs.rm(tmpHome, {recursive: true, force: true});
  });

  it('does nothing when update checks are disabled via the environment', async () => {
    process.env[NO_UPDATE_CHECKS_ENV] = 'true';
    await checkForUpdates('update me');
    assert.strictEqual(warnings.length, 0);
    assert.strictEqual(spawnCalls.length, 0);
    await assert.rejects(fs.stat(cachePath()));
  });

  it('creates a cache file with the current version and spawns the checker when no cache exists', async () => {
    await checkForUpdates('update me');
    const content = JSON.parse(await fs.readFile(cachePath(), 'utf8'));
    assert.deepStrictEqual(content, {version: VERSION});
    assert.strictEqual(warnings.length, 0);
    assert.strictEqual(spawnCalls.length, 1);
    const call = spawnCalls[0];
    assert.strictEqual(call.command, process.execPath);
    assert.strictEqual(path.basename(call.args[0]), 'check-latest-version.js');
    assert.strictEqual(call.args[1], cachePath());
    assert.strictEqual(call.options.detached, true);
    assert.strictEqual(call.options.stdio, 'ignore');
  });

  it('warns when the cached version is newer than the current version', async () => {
    await writeCache(JSON.stringify({version: NEWER_VERSION}));
    await checkForUpdates('Run npm update to get the latest version.');
    assert.strictEqual(warnings.length, 1);
    assert.ok(
      warnings[0].includes(`Update available: ${VERSION} -> ${NEWER_VERSION}`),
    );
    assert.ok(
      warnings[0].includes('Run npm update to get the latest version.'),
    );
  });

  it('does not warn or re-check when the cache is fresh and not newer', async () => {
    await writeCache(JSON.stringify({version: VERSION}));
    await checkForUpdates('update me');
    assert.strictEqual(warnings.length, 0);
    assert.strictEqual(spawnCalls.length, 0);
  });

  it('does not re-check when the cache is fresh even if an update is available', async () => {
    await writeCache(JSON.stringify({version: NEWER_VERSION}));
    await checkForUpdates('update me');
    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(spawnCalls.length, 0);
    // The fresh cache is left untouched.
    const content = JSON.parse(await fs.readFile(cachePath(), 'utf8'));
    assert.deepStrictEqual(content, {version: NEWER_VERSION});
  });

  it('ignores a cache file that does not contain valid JSON', async () => {
    await writeCache('not json');
    await checkForUpdates('update me');
    assert.strictEqual(warnings.length, 0);
    // The file exists with a fresh mtime, so no new check is started.
    assert.strictEqual(spawnCalls.length, 0);
  });

  it('re-checks and refreshes the mtime when the cache is older than 24 hours', async () => {
    await writeCache(JSON.stringify({version: '0.0.0'}));
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await fs.utimes(cachePath(), yesterday, yesterday);

    await checkForUpdates('update me');

    assert.strictEqual(warnings.length, 0);
    assert.strictEqual(spawnCalls.length, 1);
    const stats = await fs.stat(cachePath());
    assert.ok(Date.now() - stats.mtimeMs < 60 * 1000);
    // The stale cache content is preserved; only the mtime is bumped.
    const content = JSON.parse(await fs.readFile(cachePath(), 'utf8'));
    assert.deepStrictEqual(content, {version: '0.0.0'});
  });

  it('only checks once per process unless the flag is reset', async () => {
    await writeCache(JSON.stringify({version: NEWER_VERSION}));
    await checkForUpdates('update me');
    assert.strictEqual(warnings.length, 1);

    await checkForUpdates('update me');
    assert.strictEqual(warnings.length, 1);

    resetUpdateCheckFlagForTesting();
    await checkForUpdates('update me');
    assert.strictEqual(warnings.length, 2);
  });
});
