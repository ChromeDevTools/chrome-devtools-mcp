/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import type fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  ConfigWatcher,
  type DirectoryWatcher,
} from '../../src/config/ConfigWatcher.js';

const DEBOUNCE_MS = 50;
const CONFIG_DIR = path.resolve('/config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'cd4a.config.json');

class TestConfigWatcher extends ConfigWatcher {
  watchedDir?: string;
  readonly #files = new Map<string, string>();
  readonly #symlinks = new Map<string, string>();
  #listener?: fs.WatchListener<string>;

  constructor(
    configPath: string,
    onChange: () => Promise<void> = sinon.stub().resolves(),
  ) {
    super(configPath, onChange, {debounceMs: DEBOUNCE_MS});
    this.#files.set(configPath, '{}');
  }

  setSymlink(linkPath: string, targetPath: string): void {
    this.#symlinks.set(linkPath, targetPath);
  }

  setFileContent(filePath: string, content: string): void {
    this.#files.set(filePath, content);
  }

  writeFile(filePath: string, content: string): void {
    this.#files.set(filePath, content);
    this.emitFsEvent('change', path.basename(filePath));
  }

  replaceFile(filePath: string, content: string): void {
    this.#files.set(filePath, content);
    this.emitFsEvent('rename', path.basename(filePath));
  }

  deleteFile(filePath: string): void {
    this.#files.delete(filePath);
    this.emitFsEvent('rename', path.basename(filePath));
  }

  emitFsEvent(
    eventType: fs.WatchEventType,
    changedFileName: string | null,
  ): void {
    this.#listener?.(eventType, changedFileName);
  }

  protected override resolveRealPath(filePath: string): string {
    const target = this.#symlinks.get(filePath) ?? filePath;
    if (!this.#files.has(target)) {
      throw new Error(
        `ENOENT: no such file or directory, realpath '${filePath}'`,
      );
    }
    return target;
  }

  protected override readContent(filePath: string): string | undefined {
    return this.#files.get(filePath);
  }

  protected override watchDirectory(
    dirPath: string,
    listener: fs.WatchListener<string>,
  ): DirectoryWatcher {
    this.watchedDir = dirPath;
    this.#listener = listener;
    return {
      on: () => {},
      close: () => {
        this.#listener = undefined;
      },
    };
  }
}

function startWatcher(
  watchedPath: string,
  onChange: () => Promise<void> = sinon.stub().resolves(),
): TestConfigWatcher {
  const watcher = new TestConfigWatcher(watchedPath, onChange);
  watcher.start();
  return watcher;
}

describe('ConfigWatcher', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('calls onChange once for several quick writes', async () => {
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(CONFIG_PATH, onChange);

    watcher.writeFile(CONFIG_PATH, '{"headless": true}');
    watcher.writeFile(CONFIG_PATH, '{"headless": false}');
    await clock.tickAsync(DEBOUNCE_MS);

    sinon.assert.calledOnceWithExactly(onChange);
  });

  it('detects atomic replacements', async () => {
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(CONFIG_PATH, onChange);

    watcher.replaceFile(CONFIG_PATH, '{"headless": true}');
    await clock.tickAsync(DEBOUNCE_MS);

    sinon.assert.calledOnceWithExactly(onChange);
  });

  it('ignores other files in the directory', async () => {
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(CONFIG_PATH, onChange);

    watcher.writeFile(path.join(CONFIG_DIR, 'other.json'), '{}');
    await clock.tickAsync(DEBOUNCE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('follows symlinks to the real config file', async () => {
    const linkPath = path.resolve('/link/cd4a.config.json');
    const onChange = sinon.stub().resolves();
    using watcher = new TestConfigWatcher(linkPath, onChange);
    watcher.setSymlink(linkPath, CONFIG_PATH);
    watcher.setFileContent(CONFIG_PATH, '{}');
    watcher.start();

    assert.strictEqual(watcher.watchedDir, CONFIG_DIR);
    watcher.writeFile(CONFIG_PATH, '{"headless": true}');
    await clock.tickAsync(DEBOUNCE_MS);

    sinon.assert.calledOnceWithExactly(onChange);
  });

  it('does not call onChange if the content did not change', async () => {
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(CONFIG_PATH, onChange);

    watcher.writeFile(CONFIG_PATH, '{}');
    await clock.tickAsync(DEBOUNCE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('does not call onChange when the config file cannot be read', async () => {
    const onChange = sinon.stub().resolves();
    using watcher = startWatcher(CONFIG_PATH, onChange);

    watcher.deleteFile(CONFIG_PATH);
    await clock.tickAsync(DEBOUNCE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('stops calling onChange after dispose', async () => {
    const onChange = sinon.stub().resolves();
    const watcher = startWatcher(CONFIG_PATH, onChange);

    watcher.dispose();
    watcher.writeFile(CONFIG_PATH, '{"headless": true}');
    await clock.tickAsync(DEBOUNCE_MS);

    sinon.assert.notCalled(onChange);
  });

  it('logs errors from onChange', async () => {
    const consoleError = sinon.stub(console, 'error');
    const error = new Error('apply failed');
    using watcher = startWatcher(CONFIG_PATH, sinon.stub().rejects(error));

    watcher.writeFile(CONFIG_PATH, '{"headless": true}');
    await clock.tickAsync(DEBOUNCE_MS);

    sinon.assert.calledOnceWithExactly(
      consoleError,
      `Failed to apply ${CONFIG_PATH}:`,
      error,
    );
  });

  it('serializes overlapping onChange calls', async () => {
    const firstCall = Promise.withResolvers<void>();
    const secondCall = Promise.withResolvers<void>();
    const onChange = sinon.stub();
    onChange.onFirstCall().returns(firstCall.promise);
    onChange.onSecondCall().callsFake(async () => {
      secondCall.resolve();
    });
    using watcher = startWatcher(CONFIG_PATH, onChange);

    watcher.writeFile(CONFIG_PATH, '{"headless": true}');
    await clock.tickAsync(DEBOUNCE_MS);
    sinon.assert.calledOnce(onChange);

    watcher.writeFile(CONFIG_PATH, '{"headless": false}');
    await clock.tickAsync(DEBOUNCE_MS);
    sinon.assert.calledOnce(onChange);

    firstCall.resolve();
    await secondCall.promise;
    sinon.assert.calledTwice(onChange);
  });
});
