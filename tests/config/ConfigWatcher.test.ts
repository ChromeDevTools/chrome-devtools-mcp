/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {ConfigWatcher} from '../../src/config/ConfigWatcher.js';
import {createTempDir} from '../utils.js';

const DEBOUNCE_MS = 50;
// Long enough for fs events to be delivered and the debounce to fire.
const SETTLE_MS = 500;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeConfig(dir: string): string {
  const configPath = path.join(dir, 'cd4a.config.json');
  fs.writeFileSync(configPath, '{}');
  return configPath;
}

function startWatcher(
  watchedPath: string,
  onChange: () => Promise<void> = sinon.stub().resolves(),
): ConfigWatcher {
  const watcher = new ConfigWatcher(watchedPath, onChange, {
    debounceMs: DEBOUNCE_MS,
  });
  watcher.start();
  return watcher;
}

describe('ConfigWatcher', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('calls onChange once for several quick writes', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using _watcher = startWatcher(configPath, onChange);

    fs.writeFileSync(configPath, '{"headless": true}');
    fs.writeFileSync(configPath, '{"headless": false}');
    await wait(SETTLE_MS);

    sinon.assert.calledOnceWithExactly(onChange);
  });

  it('detects atomic replacements', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using _watcher = startWatcher(configPath, onChange);

    const tempPath = path.join(dir.path, 'cd4a.config.json.tmp');
    fs.writeFileSync(tempPath, '{"headless": true}');
    fs.renameSync(tempPath, configPath);
    await wait(SETTLE_MS);

    sinon.assert.called(onChange);
  });

  it('ignores other files in the directory', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using _watcher = startWatcher(configPath, onChange);

    fs.writeFileSync(path.join(dir.path, 'other.json'), '{}');
    await wait(SETTLE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('follows symlinks to the real config file', async () => {
    using dir = createTempDir('cd4a-watcher-');
    using linkDir = createTempDir('cd4a-link-');
    const configPath = writeConfig(dir.path);
    const linkPath = path.join(linkDir.path, 'cd4a.config.json');
    fs.symlinkSync(configPath, linkPath);
    const onChange = sinon.stub().resolves();
    using _watcher = startWatcher(linkPath, onChange);

    fs.writeFileSync(configPath, '{"headless": true}');
    await wait(SETTLE_MS);

    sinon.assert.calledOnceWithExactly(onChange);
  });

  it('stops calling onChange after dispose', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    const watcher = startWatcher(configPath, onChange);

    watcher.dispose();
    fs.writeFileSync(configPath, '{"headless": true}');
    await wait(SETTLE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('logs errors from onChange', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const consoleError = sinon.stub(console, 'error');
    const error = new Error('apply failed');
    using _watcher = startWatcher(configPath, sinon.stub().rejects(error));

    fs.writeFileSync(configPath, '{"headless": true}');
    await wait(SETTLE_MS);

    sinon.assert.calledOnceWithExactly(
      consoleError,
      `Failed to apply ${configPath}:`,
      error,
    );
  });
});
