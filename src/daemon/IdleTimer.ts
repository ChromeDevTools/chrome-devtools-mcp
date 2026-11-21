/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Calls `onIdle` when no tracked activity has run for `timeoutMs`. The
 * countdown is paused while an activity runs, so a long activity is never cut
 * off. When `timeoutMs` is undefined, the timer is disabled.
 */
export class IdleTimer {
  readonly #timeoutMs: number | undefined;
  readonly #onIdle: () => void;
  #inFlight = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;

  constructor(options: {timeoutMs: number | undefined; onIdle: () => void}) {
    this.#timeoutMs = options.timeoutMs;
    this.#onIdle = options.onIdle;
  }

  /**
   * Starts or restarts the countdown unless an activity is running.
   */
  schedule(): void {
    this.#clear();
    if (this.#timeoutMs === undefined || this.#inFlight > 0 || this.#disposed) {
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#onIdle();
    }, this.#timeoutMs);
  }

  /**
   * Runs `activity` with the countdown paused and restarts the countdown when
   * the activity settles.
   */
  async track<T>(activity: () => Promise<T>): Promise<T> {
    this.#inFlight++;
    this.#clear();
    try {
      return await activity();
    } finally {
      this.#inFlight--;
      this.schedule();
    }
  }

  /**
   * Stops the countdown for good.
   */
  dispose(): void {
    this.#disposed = true;
    this.#clear();
  }

  #clear(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
