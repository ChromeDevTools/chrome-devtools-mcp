/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Node's `setTimeout` fires immediately for longer delays.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const UNIT_MS = new Map([
  ['s', 1_000],
  ['m', 60_000],
  ['h', 3_600_000],
]);

/**
 * Parses the duration `value` of the option `name`, such as `90s`, `30m` or
 * `2h`, into milliseconds. Throws for other formats, zero, and values above
 * {@link MAX_TIMEOUT_MS}.
 */
export function parseDurationMs(name: string, value: string): number {
  const match = /^(\d+)([smh])$/.exec(value);
  const unitMs = match ? UNIT_MS.get(match[2]) : undefined;
  if (!match || unitMs === undefined || Number(match[1]) === 0) {
    throw new Error(
      `Invalid ${name} ${JSON.stringify(value)}. Expected a positive integer followed by s, m or h, for example 90s, 30m or 2h.`,
    );
  }
  const ms = Number(match[1]) * unitMs;
  if (ms > MAX_TIMEOUT_MS) {
    throw new Error(
      `Invalid ${name} ${JSON.stringify(value)}. Expected at most ${MAX_TIMEOUT_MS} ms (about 596h).`,
    );
  }
  return ms;
}
