import type { Brand } from './Brand.js';
/**
 * URLs are in DevTools are repsented as encoded URL strings.
 *
 * @example 'file:///Hello%20World/file/js'
 */
export type UrlString = Brand<string, 'UrlString'>;
export declare const EmptyUrlString: UrlString;
/**
 * Tagged template helper to construct `UrlString`s in a more readable form,
 * without having to sprinkle casts throughout the codebase. Primarily useful
 * for writing unit tests.
 *
 * Usage:
 * ```js
 * const url1 = urlString`https://www.example.com/404.html`;
 * const url2 = urlString`http://${host}/path/to/file.js`;
 * ```
 *
 * This is implemented as a wrapper around `String.raw` for convenience. This
 * function doesn't perform any kind of validation that the returned string is
 * really a valid `UrlString`.
 *
 * @param strings the string parts of the template.
 * @param values the dynamic values of the template.
 * @returns the string constructed from `strings` and `values` casted to an
 *         `UrlString`.
 */
export declare const urlString: (strings: ArrayLike<string>, ...values: any[]) => UrlString;
/**
 * File paths in DevTools that are represented as unencoded absolute
 * or relative paths.
 *
 * @example '/Hello World/file.js'
 */
export type RawPathString = Brand<string, 'RawPathString'>;
export declare const EmptyRawPathString: RawPathString;
/**
 * File paths in DevTools that are represented as encoded paths.
 *
 * @example '/Hello%20World/file.js'
 */
export type EncodedPathString = Brand<string, 'EncodedPathString'>;
export declare const EmptyEncodedPathString: EncodedPathString;
