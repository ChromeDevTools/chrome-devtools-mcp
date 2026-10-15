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
const POLL_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 20;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCall(stub: sinon.SinonStub): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (!stub.called) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for stub to be called');
    }
    await wait(POLL_INTERVAL_MS);
  }
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
    using watcher = startWatcher(configPath, onChange);

    fs.writeFileSync(configPath, '{"headless": true}');
    fs.writeFileSync(configPath, '{"headless": false}');
    await waitForCall(onChange);

    sinon.assert.calledOnceWithExactly(onChange);
  });

  it('detects atomic replacements', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(configPath, onChange);

    const tempPath = path.join(dir.path, 'cd4a.config.json.tmp');
    fs.writeFileSync(tempPath, '{"headless": true}');
    fs.renameSync(tempPath, configPath);
    await waitForCall(onChange);

    sinon.assert.calledOnceWithExactly(onChange);
  });

  it('ignores other files in the directory', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(configPath, onChange);

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
    using watcher = startWatcher(linkPath, onChange);

    fs.writeFileSync(configPath, '{"headless": true}');
    await waitForCall(onChange);

    sinon.assert.calledOnceWithExactly(onChange);
  });

  it('does not call onChange if the content did not change', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(configPath, onChange);

    fs.writeFileSync(configPath, '{}');
    await wait(SETTLE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('does not call onChange when the config file cannot be read', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(configPath, onChange);

    fs.unlinkSync(configPath);
    await wait(SETTLE_MS);

    sinon.assert.notCalled(onChange);
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
    using watcher = startWatcher(configPath, sinon.stub().rejects(error));

    fs.writeFileSync(configPath, '{"headless": true}');
    await waitForCall(consoleError);

    sinon.assert.calledOnceWithExactly(
      consoleError,
      `Failed to apply ${configPath}:`,
      error,
    );
  });

  it('serializes overlapping onChange calls', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const firstCall = Promise.withResolvers<void>();
    const secondCall = Promise.withResolvers<void>();
    const onChange = sinon.stub();
    onChange.onFirstCall().returns(firstCall.promise);
    onChange.onSecondCall().callsFake(async () => {
      secondCall.resolve();
    });
    using watcher = startWatcher(configPath, onChange);

    fs.writeFileSync(configPath, '{"headless": true}');
    await waitForCall(onChange);
    sinon.assert.calledOnce(onChange);

    fs.writeFileSync(configPath, '{"headless": false}');
    await wait(SETTLE_MS);
    sinon.assert.calledOnce(onChange);

    firstCall.resolve();
    await secondCall.promise;
    sinon.assert.calledTwice(onChange);
  });
});
