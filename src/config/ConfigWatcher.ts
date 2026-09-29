/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import {DevTools} from '../third_party/index.js';
import {logger} from '../utils/logger.js';

const DEFAULT_DEBOUNCE_MS = 200;

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
 */
export class ConfigWatcher implements Disposable {
  readonly #configPath: string;
  readonly #onChange: () => Promise<void>;
  readonly #debounceMs: number;
  #watcher?: fs.FSWatcher;
  #debounced?: ReturnType<typeof DevTools.Common.Debouncer.debounce>;

  constructor(
    configPath: string,
    onChange: () => Promise<void>,
    options: {debounceMs?: number} = {},
  ) {
    this.#configPath = configPath;
    this.#onChange = onChange;
    this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  start(): void {
    if (this.#watcher) {
      return;
    }
    const realPath = fs.realpathSync(this.#configPath);
    const fileName = path.basename(realPath);
    this.#debounced = DevTools.Common.Debouncer.debounce(() => {
      this.#onChange().catch(err => {
        console.error(`Failed to apply ${this.#configPath}:`, err);
      });
    }, this.#debounceMs);
    this.#watcher = fs.watch(
      path.dirname(realPath),
      {persistent: false},
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
