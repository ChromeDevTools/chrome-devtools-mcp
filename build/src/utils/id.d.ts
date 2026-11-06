/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare function createIdGenerator(): () => number;
export declare const stableIdSymbol: unique symbol;
export type WithSymbolId<T> = T & {
    [stableIdSymbol]?: number;
};
