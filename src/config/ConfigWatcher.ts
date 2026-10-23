/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import {DevTools} from '../third_party/index.js';
import {getErrorMessage} from '../utils/errorHandling.js';
import {logger} from '../utils/logger.js';

const DEFAULT_DEBOUNCE_MS = 200;

/**
 * Returns undefined if the file cannot be read, for example while it is being
 * replaced.
 */
function readContent(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Watches a config file and calls `onChange` with the new content after it was
 * modified.
 *
 * - Both the config path's directory and (for symlinks to another directory)
 *   the target file's directory are watched. Watching the directory instead of
 *   the file keeps working when editors save atomically by replacing the file
 *   or when a symlink is retargeted.
 * - Events are debounced because some platforms emit several events for a
 *   single change.
 * - Some platforms do not report the file name, such events are not filtered.
 * - `onChange` is only called if the content changed. For example, macOS can
 *   report events that happened shortly before the watcher was started.
 */
export class ConfigWatcher implements Disposable {
  readonly #configPath: string;
  readonly #onChange: (content: string) => Promise<void>;
  readonly #debounceMs: number;
  #linkWatcher?: fs.FSWatcher;
  #targetWatcher?: fs.FSWatcher;
  #targetWatchDir?: string;
  #realPath = '';
  #debounced?: ReturnType<typeof DevTools.Common.Debouncer.debounce>;
  #content?: string;
  #pending = Promise.resolve();

  constructor(
    configPath: string,
    onChange: (content: string) => Promise<void>,
    options: {debounceMs?: number} = {},
  ) {
    this.#configPath = configPath;
    this.#onChange = onChange;
    this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  /**
   * Starts watching the config file. Throws if `configPath` does not exist.
   */
  start(): void {
    if (this.#linkWatcher) {
      return;
    }
    const realPath = fs.realpathSync(this.#configPath);
    const linkDir = fs.realpathSync(path.dirname(this.#configPath));
    const linkName = path.basename(this.#configPath);
    this.#realPath = realPath;
    this.#content = readContent(realPath);
    this.#debounced = DevTools.Common.Debouncer.debounce(() => {
      if (!this.#linkWatcher) {
        return;
      }
      let currentRealPath: string;
      try {
        currentRealPath = fs.realpathSync(this.#configPath);
      } catch {
        return;
      }
      const content = readContent(currentRealPath);
      if (content === undefined) {
        return;
      }
      this.#realPath = currentRealPath;
      this.#syncTargetWatcher(linkDir);
      if (content === this.#content) {
        return;
      }
      this.#content = content;
      this.#pending = this.#pending
        .then(() => this.#onChange(content))
        .catch(err => {
          console.error(`Failed to apply ${this.#configPath}:`, err);
        });
    }, this.#debounceMs);
    this.#linkWatcher = this.#watchDirectory(linkDir, changedFileName => {
      if (
        changedFileName !== null &&
        changedFileName !== linkName &&
        (path.dirname(this.#realPath) !== linkDir ||
          changedFileName !== path.basename(this.#realPath))
      ) {
        return;
      }
      this.#debounced?.();
    });
    this.#syncTargetWatcher(linkDir);
    logger?.(`Watching ${realPath} for config changes`);
  }

  #watchDirectory(
    dir: string,
    onEvent: (changedFileName: string | null) => void,
  ): fs.FSWatcher {
    const watcher = fs.watch(
      dir,
      {persistent: false},
      (_eventType, changedFileName) => {
        onEvent(changedFileName);
      },
    );
    watcher.on('error', err => {
      console.error(
        `Stopped watching ${this.#configPath}: ${getErrorMessage(err)}`,
      );
      this.dispose();
    });
    return watcher;
  }

  #syncTargetWatcher(linkDir: string): void {
    const realDir = path.dirname(this.#realPath);
    if (realDir === linkDir) {
      this.#targetWatcher?.close();
      this.#targetWatcher = undefined;
      this.#targetWatchDir = undefined;
      return;
    }
    if (this.#targetWatchDir === realDir && this.#targetWatcher) {
      return;
    }
    this.#targetWatcher?.close();
    this.#targetWatcher = undefined;
    this.#targetWatchDir = undefined;
    try {
      this.#targetWatcher = this.#watchDirectory(realDir, changedFileName => {
        if (
          changedFileName !== null &&
          changedFileName !== path.basename(this.#realPath)
        ) {
          return;
        }
        this.#debounced?.();
      });
      this.#targetWatchDir = realDir;
    } catch (err) {
      console.error(
        `Stopped watching ${this.#configPath}: ${getErrorMessage(err)}`,
      );
      this.dispose();
    }
  }

  dispose(): void {
    this.#debounced?.cancel();
    this.#debounced = undefined;
    this.#linkWatcher?.close();
    this.#linkWatcher = undefined;
    this.#targetWatcher?.close();
    this.#targetWatcher = undefined;
    this.#targetWatchDir = undefined;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}
