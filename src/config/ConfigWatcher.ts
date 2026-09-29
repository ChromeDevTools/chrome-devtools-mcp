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
  #watcher?: fs.FSWatcher;
  #debounced?: ReturnType<typeof DevTools.Common.Debouncer.debounce>;
  #content?: string;

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
    this.#content = readContent(realPath);
    this.#debounced = DevTools.Common.Debouncer.debounce(() => {
      const content = readContent(realPath);
      if (content === this.#content) {
        return;
      }
      this.#content = content;
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
