/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Deferred } from '../third_party/index.js';
/**
 * Rejects with a Puppeteer `TimeoutError` with `message` if `promise` does not
 * settle within `timeout` ms. The timer is cleared when the race settles.
 */
export async function withTimeout(promise, options) {
    return await Deferred.race([promise, Deferred.create(options)]);
}
//# sourceMappingURL=timeout.js.map