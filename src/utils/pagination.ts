/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {PaginationOptions} from '../types.js';

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

export function paginate<Item>(
  items: readonly Item[],
  options?: PaginationOptions,
): PaginationResult<Item> {
  const total = items.length;

  if (!options || options.pageSize === undefined) {
    const {currentPage, invalidPage} = resolvePageIndex(options?.pageIdx, 1);
    return {
      items,
      currentPage,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      startIndex: 0,
      endIndex: total,
      invalidPage,
    };
  }

  const pageSize = options.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const {currentPage, invalidPage} = resolvePageIndex(
    options.pageIdx,
    totalPages,
  );

  const startIndex = currentPage * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);
  const endIndex = startIndex + pageItems.length;

  return {
    items: pageItems,
    currentPage,
    totalPages,
    hasNextPage: currentPage < totalPages - 1,
    hasPreviousPage: currentPage > 0,
    startIndex,
    endIndex,
    invalidPage,
  };
}

function resolvePageIndex(
  pageIdx: number | undefined,
  totalPages: number,
): {
  currentPage: number;
  invalidPage: boolean;
} {
  if (pageIdx === undefined) {
    return {currentPage: 0, invalidPage: false};
  }

  if (pageIdx < 0 || pageIdx >= totalPages) {
    return {currentPage: 0, invalidPage: true};
  }

  return {currentPage: pageIdx, invalidPage: false};
}
