/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Rejects with a Puppeteer `TimeoutError` with `message` if `promise` does not
 * settle within `timeout` ms. The timer is cleared when the race settles.
 */
export declare function withTimeout<T>(promise: Promise<T>, options: {
    timeout: number;
    message: string;
}): Promise<T>;
