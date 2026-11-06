/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Watches a config file and calls `onChange` with the new content after it was
 * modified.
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
export declare class ConfigWatcher implements Disposable {
    #private;
    constructor(configPath: string, onChange: (content: string) => Promise<void>, options?: {
        debounceMs?: number;
    });
    /**
     * Starts watching the config file. Throws if `configPath` does not exist.
     */
    start(): void;
    dispose(): void;
    [Symbol.dispose](): void;
}
