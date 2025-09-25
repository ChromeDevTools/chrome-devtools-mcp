/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PaginationOptions {
  pageSize?: number;
  pageIdx?: number;
}

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

const DEFAULT_PAGE_SIZE = 20;

export function paginate<Item>(
  items: readonly Item[],
  options?: PaginationOptions,
): PaginationResult<Item> {
  const total = items.length;

  if (!options || noPaginationOptions(options)) {
    return {
      items,
      currentPage: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      startIndex: 0,
      endIndex: total,
      invalidPage: false,
    };
  }

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
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

function noPaginationOptions(options: PaginationOptions): boolean {
  return options.pageSize === undefined && options.pageIdx === undefined;
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
