export declare const removeElement: <T>(array: T[], element: T, firstOnly?: boolean) => boolean;
type NumberComparator = (a: number, b: number) => number;
export declare function swap<T>(array: T[], i1: number, i2: number): void;
export declare function sortRange(array: number[], comparator: NumberComparator, leftBound: number, rightBound: number, sortWindowLeft: number, sortWindowRight: number): number[];
export declare const binaryIndexOf: <T, S>(array: T[], value: S, comparator: (a: S, b: T) => number) => number;
export declare const intersectOrdered: <T>(array1: T[], array2: T[], comparator: (a: T, b: T) => number) => T[];
export declare const mergeOrdered: <T>(array1: T[], array2: T[], comparator: (a: T, b: T) => number) => T[];
export declare const DEFAULT_COMPARATOR: (a: string | number, b: string | number) => -1 | 0 | 1;
/**
 * Returns the index of the element closest to the needle that is equal to or
 * greater than it. Assumes that the provided array is sorted.
 *
 * If no element is found, the right bound is returned.
 *
 * Uses the provided comparator function to determine if two items are equal or
 * if one is greater than the other. If you are working with strings or
 * numbers, you can use ArrayUtilities.DEFAULT_COMPARATOR. Otherwise, you
 * should define one that takes the needle element and an element from the
 * array and returns a positive or negative number to indicate which is greater
 * than the other.
 *
 * When specified, |left| (inclusive) and |right| (exclusive) indices
 * define the search window.
 */
export declare function lowerBound<T>(array: Uint32Array | Int32Array, needle: T, comparator: (needle: T, b: number) => number, left?: number, right?: number): number;
export declare function lowerBound<S, T>(array: S[], needle: T, comparator: (needle: T, b: S) => number, left?: number, right?: number): number;
export declare function lowerBound<S, T>(array: readonly S[], needle: T, comparator: (needle: T, b: S) => number, left?: number, right?: number): number;
/**
 * Inserts a value into a sorted array in O(n) time (O(log n) search using the provided comparator and O(n) insertion).
 * Returns the index at which the value was inserted.
 */
export declare function insertWithComparator<T>(array: T[], value: T, comparator: (a: T, b: T) => number): number;
/**
 * Returns the index of the element closest to the needle that is greater than
 * it. Assumes that the provided array is sorted.
 *
 * If no element is found, the right bound is returned.
 *
 * Uses the provided comparator function to determine if two items are equal or
 * if one is greater than the other. If you are working with strings or
 * numbers, you can use ArrayUtilities.DEFAULT_COMPARATOR. Otherwise, you
 * should define one that takes the needle element and an element from the
 * array and returns a positive or negative number to indicate which is greater
 * than the other.
 *
 * When specified, |left| (inclusive) and |right| (exclusive) indices
 * define the search window.
 */
export declare function upperBound<T>(array: Uint32Array, needle: T, comparator: (needle: T, b: number) => number, left?: number, right?: number): number;
export declare function upperBound<S, T>(array: S[], needle: T, comparator: (needle: T, b: S) => number, left?: number, right?: number): number;
/**
 * Obtains the first item in the array that satisfies the predicate function.
 * So, for example, if the array was arr = [2, 4, 6, 8, 10], and you are looking for
 * the first item arr[i] such that arr[i] > 5 you would be returned 2, because
 * array[2] is 6, the first item in the array that satisfies the
 * predicate function.
 *
 * Please note: this presupposes that the array is already ordered.
 */
export declare function nearestIndexFromBeginning<T>(arr: T[], predicate: (arrayItem: T) => boolean): number | null;
/**
 * Obtains the last item in the array that satisfies the predicate function.
 * So, for example, if the array was arr = [2, 4, 6, 8, 10], and you are looking for
 * the last item arr[i] such that arr[i] < 5 you would be returned 1, because
 * arr[1] is 4, the last item in the array that satisfies the
 * predicate function.
 *
 * Please note: this presupposes that the array is already ordered.
 */
export declare function nearestIndexFromEnd<T>(arr: readonly T[], predicate: (arrayItem: T) => boolean): number | null;
/** Type guard for ensuring that `arr` does not contain null or undefined **/
export declare function arrayDoesNotContainNullOrUndefined<T>(arr: Array<T | null | undefined>): arr is T[];
export declare function assertArrayIsSorted<T>(arr: readonly T[], compareFn?: (a: T, b: T) => number): void;
export {};
