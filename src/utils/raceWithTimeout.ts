/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {raceWithSignal} from './raceWithSignal.js';

/**
 * Races `promise` against a deadline of `timeoutMs`, calling `onTimeout()`
 * only if the deadline wins — never on abort.
 *
 * The loser of the race is left running: Chrome DevTools MCP talks to
 * operations (a browser launch, an unpacked-extension install) that have no
 * cancel command, so the timeout bounds how long we WAIT, not how long the
 * work lasts. The timer is `unref()`d so a successful call cannot hold the
 * process open, and it is cleared on every exit path.
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  options: {
    timeoutMs: number;
    /** Rejected with this exact instance when the deadline wins. */
    error: Error;
    signal?: AbortSignal;
    onTimeout?: () => void;
  },
): Promise<T> {
  const {timeoutMs, error, signal, onTimeout} = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(error), timeoutMs);
    timer.unref?.();
  });
  try {
    const raced = Promise.race([promise, deadline]);
    return await (signal ? raceWithSignal(raced, signal) : raced);
  } catch (err) {
    // Identity, not message: an abort and a browser error must not be
    // mistaken for the deadline.
    if (err === error) {
      onTimeout?.();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
