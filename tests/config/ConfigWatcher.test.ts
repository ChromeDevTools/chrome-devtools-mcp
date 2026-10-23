/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

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

/**
 * Resolves once fs events for `dir` are delivered.
 *
 * On macOS, libuv creates a single FSEvents stream per event loop on a
 * background thread, and `fs.watch` returns before the stream exists. Changes
 * made in that window are lost. The probe watcher shares the stream with the
 * ConfigWatcher, so an event for the probe file proves the stream is active.
 * The caller must keep the probe open: closing it recreates the stream.
 */
async function waitForWatchReady(dir: string): Promise<fs.FSWatcher> {
  let ready = false;
  const probe = fs.watch(dir, {persistent: false}, () => {
    ready = true;
  });
  const probePath = path.join(dir, 'probe');
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (!ready) {
    if (Date.now() >= deadline) {
      probe.close();
      throw new Error(`Timed out waiting for fs.watch on ${dir}`);
    }
    fs.writeFileSync(probePath, String(Date.now()));
    await wait(POLL_INTERVAL_MS);
  }
  return probe;
}

async function startWatcher(
  watchedPath: string,
  onChange: (content: string) => Promise<void> = sinon.stub().resolves(),
): Promise<{watcher: ConfigWatcher} & Disposable> {
  const watcher = new ConfigWatcher(watchedPath, onChange, {
    debounceMs: DEBOUNCE_MS,
  });
  watcher.start();
  const realDir = path.dirname(fs.realpathSync(watchedPath));
  const linkDir = fs.realpathSync(path.dirname(watchedPath));
  const probes = [await waitForWatchReady(realDir)];
  if (linkDir !== realDir) {
    probes.push(await waitForWatchReady(linkDir));
  }
  return {
    watcher,
    [Symbol.dispose]() {
      watcher.dispose();
      for (const probe of probes) {
        probe.close();
      }
    },
  };
}

describe('ConfigWatcher', () => {
  it('calls onChange once for several quick writes', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = await startWatcher(configPath, onChange);

    fs.writeFileSync(configPath, '{"headless": true}');
    fs.writeFileSync(configPath, '{"headless": false}');
    await waitForCall(onChange);

    sinon.assert.calledOnceWithExactly(onChange, '{"headless": false}');
  });

  it('detects atomic replacements', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = await startWatcher(configPath, onChange);

    const tempPath = path.join(dir.path, 'cd4a.config.json.tmp');
    fs.writeFileSync(tempPath, '{"headless": true}');
    fs.renameSync(tempPath, configPath);
    await waitForCall(onChange);

    sinon.assert.calledOnceWithExactly(onChange, '{"headless": true}');
  });

  it('ignores other files in the directory', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = await startWatcher(configPath, onChange);

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
    using watcher = await startWatcher(linkPath, onChange);

    fs.writeFileSync(configPath, '{"headless": true}');
    await waitForCall(onChange);

    sinon.assert.calledOnceWithExactly(onChange, '{"headless": true}');
  });

  it('detects symlink retargeting and subsequent writes to the new target', async () => {
    using dir1 = createTempDir('cd4a-target1-');
    using dir2 = createTempDir('cd4a-target2-');
    using linkDir = createTempDir('cd4a-link-');
    const v1Path = path.join(dir1.path, 'v1.json');
    const v2Path = path.join(dir2.path, 'v2.json');
    fs.writeFileSync(v1Path, '{"headless": false}');
    fs.writeFileSync(v2Path, '{"headless": true}');
    const linkPath = path.join(linkDir.path, 'cd4a.config.json');
    fs.symlinkSync(v1Path, linkPath);
    const onChange = sinon.stub().resolves();
    using watcher = await startWatcher(linkPath, onChange);

    const tempLinkPath = path.join(linkDir.path, 'cd4a.config.json.tmp');
    fs.symlinkSync(v2Path, tempLinkPath);
    fs.renameSync(tempLinkPath, linkPath);
    await waitForCall(onChange);
    sinon.assert.calledOnceWithExactly(onChange, '{"headless": true}');

    onChange.resetHistory();
    using probe2 = {
      handle: await waitForWatchReady(fs.realpathSync(dir2.path)),
      [Symbol.dispose]() {
        this.handle.close();
      },
    };
    fs.writeFileSync(v2Path, '{"slim": true}');
    await waitForCall(onChange);
    sinon.assert.calledOnceWithExactly(onChange, '{"slim": true}');
  });

  it('does not call onChange if the content did not change', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = await startWatcher(configPath, onChange);

    fs.writeFileSync(configPath, '{}');
    await wait(SETTLE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('does not call onChange when the config file cannot be read', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using watcher = await startWatcher(configPath, onChange);

    fs.unlinkSync(configPath);
    await wait(SETTLE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('stops calling onChange after dispose', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const onChange = sinon.stub().resolves();
    using started = await startWatcher(configPath, onChange);

    started.watcher.dispose();
    fs.writeFileSync(configPath, '{"headless": true}');
    await wait(SETTLE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('logs errors from onChange', async () => {
    using dir = createTempDir('cd4a-watcher-');
    const configPath = writeConfig(dir.path);
    const consoleError = sinon.stub(console, 'error');
    const error = new Error('apply failed');
    using watcher = await startWatcher(configPath, sinon.stub().rejects(error));

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
    using watcher = await startWatcher(configPath, onChange);

    fs.writeFileSync(configPath, '{"headless": true}');
    await waitForCall(onChange);
    sinon.assert.calledOnceWithExactly(onChange, '{"headless": true}');

    fs.writeFileSync(configPath, '{"headless": false}');
    await wait(SETTLE_MS);
    sinon.assert.calledOnce(onChange);

    firstCall.resolve();
    await secondCall.promise;
    sinon.assert.calledTwice(onChange);
    sinon.assert.calledWithExactly(onChange.secondCall, '{"headless": false}');
  });
});
