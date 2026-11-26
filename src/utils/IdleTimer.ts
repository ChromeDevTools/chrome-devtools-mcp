/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {MAX_SET_TIMEOUT_MS} from './duration.js';

export interface IdleTimerOptions {
  /**
   * Idle delay in milliseconds. Must be a positive integer; values above
   * {@link MAX_SET_TIMEOUT_MS} are clamped.
   */
  timeoutMs: number;
  /**
   * Invoked when the countdown elapses. Must not throw.
   */
  onIdle: () => void;
}

/**
 * Calls `onIdle` when no tracked activity has run for `timeoutMs` (clamped to
 * {@link MAX_SET_TIMEOUT_MS}). The countdown is paused while an activity runs,
 * so a long activity is never cut off. `onIdle` must not throw.
 */
export class IdleTimer {
  readonly #timeoutMs: number;
  readonly #onIdle: () => void;
  #inFlight = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;

  constructor(options: IdleTimerOptions) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new Error(
        `Invalid timeoutMs ${options.timeoutMs}. Expected a positive integer.`,
      );
    }
    this.#timeoutMs = Math.min(MAX_SET_TIMEOUT_MS, options.timeoutMs);
    this.#onIdle = options.onIdle;
  }

  /**
   * Whether at least one tracked activity is currently running.
   */
  get hasActiveWork(): boolean {
    return this.#inFlight > 0;
  }

  /**
   * Starts or restarts the countdown unless an activity is running. The
   * underlying timer is unreferenced so it does not keep the Node.js event loop
   * alive on its own, but callers must still call {@link dispose} on shutdown
   * so `onIdle` cannot run while the event loop remains active.
   */
  schedule(): void {
    this.#clear();
    if (this.#inFlight > 0 || this.#disposed) {
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#onIdle();
    }, this.#timeoutMs);
    this.#timer.unref();
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
