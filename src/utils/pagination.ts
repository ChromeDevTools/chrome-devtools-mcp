/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Options for pagination.
 * @public
 */
export interface PaginationOptions {
  /**
   * The number of items per page.
   */
  pageSize?: number;
  /**
   * The 0-based index of the page to return.
   */
  pageIdx?: number;
}

/**
 * The result of a pagination operation.
 * @template Item The type of the items being paginated.
 * @public
 */
export interface PaginationResult<Item> {
  /**
   * The items for the current page.
   */
  items: readonly Item[];
  /**
   * The 0-based index of the current page.
   */
  currentPage: number;
  /**
   * The total number of pages.
   */
  totalPages: number;
  /**
   * Whether there is a next page.
   */
  hasNextPage: boolean;
  /**
   * Whether there is a previous page.
   */
  hasPreviousPage: boolean;
  /**
   * The 0-based index of the first item on the page.
   */
  startIndex: number;
  /**
   * The 0-based index of the last item on the page.
   */
  endIndex: number;
  /**
   * Whether the requested page index was invalid.
   */
  invalidPage: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Paginates an array of items.
 *
 * @template Item The type of the items being paginated.
 * @param items - The array of items to paginate.
 * @param options - The pagination options.
 * @returns The pagination result.
 * @public
 */
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

/**
 * Checks if pagination options are provided.
 * @param options - The pagination options.
 * @returns True if no pagination options are provided, false otherwise.
 * @internal
 */
function noPaginationOptions(options: PaginationOptions): boolean {
  return options.pageSize === undefined && options.pageIdx === undefined;
}

/**
 * Resolves the page index, handling undefined and out-of-bounds values.
 * @param pageIdx - The requested page index.
 * @param totalPages - The total number of pages.
 * @returns An object with the resolved current page and a flag indicating if the
 * requested page was invalid.
 * @internal
 */
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
