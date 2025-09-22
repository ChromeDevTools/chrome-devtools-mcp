/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// For Node 20.
if (!Promise.withResolvers) {
  Promise.withResolvers = function <T>() {
    let resolve, reject;
    const promise = new Promise<T>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    return {promise, resolve, reject} as unknown as ReturnType<
      typeof Promise.withResolvers<T>
    >;
  };
}
