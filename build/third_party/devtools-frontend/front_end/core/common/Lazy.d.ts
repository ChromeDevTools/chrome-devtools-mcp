/**
 * Very basic memoizer. Will only invoke its callback the first time, returning the cached value all subsequent calls.
 */
export declare function lazy<T, A extends unknown[] = []>(producer: (...args: A) => T): (...args: A) => T;
