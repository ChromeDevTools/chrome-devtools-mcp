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

export interface DirectoryWatcher {
  on(event: 'error', listener: (err: unknown) => void): void;
  close(): void;
}

/**
 * Watches a config file and calls `onChange` after it was modified.
 *
 * - Symlinks are resolved once on start, and the directory of the real file is
 *   watched. Watching the directory instead of the file keeps working when
 *   editors save atomically by replacing the file.
 * - Events are debounced because some platforms emit several events for a
 *   single change.
 * - Some platforms do not report the file name, such events are not filtered.
 * - `onChange` is only called if the content changed. For example, macOS can
 *   report events that happened shortly before the watcher was started.
 */
export class ConfigWatcher implements Disposable {
  readonly #configPath: string;
  readonly #onChange: () => Promise<void>;
  readonly #debounceMs: number;
  #watcher?: DirectoryWatcher;
  #debounced?: ReturnType<typeof DevTools.Common.Debouncer.debounce>;
  #content?: string;
  #pending = Promise.resolve();

  constructor(
    configPath: string,
    onChange: () => Promise<void>,
    options: {debounceMs?: number} = {},
  ) {
    this.#configPath = configPath;
    this.#onChange = onChange;
    this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  protected resolveRealPath(filePath: string): string {
    return fs.realpathSync(filePath);
  }

  /**
   * Returns undefined if the file cannot be read, for example while it is being
   * replaced.
   */
  protected readContent(filePath: string): string | undefined {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return undefined;
    }
  }

  protected watchDirectory(
    dirPath: string,
    listener: fs.WatchListener<string>,
  ): DirectoryWatcher {
    return fs.watch(dirPath, {persistent: false}, listener);
  }

  /**
   * Starts watching the config file. Throws if `configPath` does not exist.
   */
  start(): void {
    if (this.#watcher) {
      return;
    }
    const realPath = this.resolveRealPath(this.#configPath);
    const fileName = path.basename(realPath);
    this.#content = this.readContent(realPath);
    this.#debounced = DevTools.Common.Debouncer.debounce(() => {
      const content = this.readContent(realPath);
      if (content === undefined || content === this.#content) {
        return;
      }
      this.#content = content;
      this.#pending = this.#pending
        .then(() => this.#onChange())
        .catch(err => {
          console.error(`Failed to apply ${this.#configPath}:`, err);
        });
    }, this.#debounceMs);
    this.#watcher = this.watchDirectory(
      path.dirname(realPath),
      (_eventType, changedFileName) => {
        if (changedFileName !== null && changedFileName !== fileName) {
          return;
        }
        this.#debounced?.();
      },
    );
    this.#watcher.on('error', err => {
      console.error(
        `Stopped watching ${this.#configPath}: ${getErrorMessage(err)}`,
      );
      this.dispose();
    });
    logger?.(`Watching ${realPath} for config changes`);
  }

  dispose(): void {
    this.#debounced?.cancel();
    this.#debounced = undefined;
    this.#watcher?.close();
    this.#watcher = undefined;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}
