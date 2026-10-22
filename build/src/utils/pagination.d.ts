/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { PaginationOptions } from '../types.js';
export interface PaginationResult<Item> {
    items: readonly Item[];
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startIndex: number;
    endIndex: number;
    invalidPage: boolean;
}
export declare function paginate<Item>(items: readonly Item[], options?: PaginationOptions): PaginationResult<Item>;
