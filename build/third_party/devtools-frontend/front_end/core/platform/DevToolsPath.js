// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const EmptyUrlString = '';
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
export const urlString = (strings, ...values) => String.raw({ raw: strings }, ...values);
export const EmptyRawPathString = '';
export const EmptyEncodedPathString = '';
//# sourceMappingURL=DevToolsPath.js.map