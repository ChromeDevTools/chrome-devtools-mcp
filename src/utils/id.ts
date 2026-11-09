/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function createIdGenerator(): () => number {
  let i = 1;
  return (): number => {
    if (i === Number.MAX_SAFE_INTEGER) {
      i = 0;
    }
    return i++;
  };
}

export const stableIdSymbol: unique symbol = Symbol('stableIdSymbol');

export type WithSymbolId<T> = T & {
  [stableIdSymbol]?: number;
};
