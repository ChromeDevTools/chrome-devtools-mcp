/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Determines whether a given URL string points to a localhost / loopback address.
 *
 * @param url The URL string to test.
 * @returns true if the URL is a valid network URL pointing to localhost or a loopback IP.
 */
export declare function isLocalhost(url?: string): boolean;
export interface ValidateUrlOptions {
    javascriptEvaluation: boolean | undefined;
    categoryExtensions: boolean | undefined;
    fileNavigations: boolean | undefined;
}
export interface IsAllowedUrlOptions {
    categoryExtensions: boolean | undefined;
}
/**
 * Determines whether a URL is allowed for navigation and page tracking.
 *
 * Disallowed schemes:
 * - chrome: (except chrome://newtab/ and chrome://inspect*)
 * - chrome-untrusted:
 * - chrome-extension: (unless categoryExtensions is true)
 *
 * @param url The URL string to test.
 * @param options Configuration specifying whether extensions are enabled.
 * @returns true if the URL is allowed.
 */
export declare function isAllowedUrl(url: string, options: IsAllowedUrlOptions): boolean;
/**
 * Validates that every pattern can be enforced by Chrome on redirects and subresources:
 * - Rejects patterns with a partial IPv4 wildcard in the hostname (for example `127.0.0.*`).
 * - Rejects patterns containing a regexp group (for example `(foo|bar)`).
 * - Rejects patterns containing a named group (`:name`, for example `*://127.0.0.1::port/path`).
 *
 * @param patterns The `--blockedUrlPattern`/`--allowedUrlPattern` values to check.
 * @param flagName The CLI flag name used in error messages.
 * @throws Error if a pattern's syntax is invalid (via `new URLPattern`) or uses an unenforceable construct.
 */
export declare function validateUrlPatterns(patterns: string[], flagName: string): void;
/**
 * Validates a URL string by parsing it with `new URL` and checking for disallowed protocols and restricted schemes.
 *
 * @param url The URL string to validate.
 * @param options Options object containing javascriptEvaluation, categoryExtensions and fileNavigations.
 * @returns The parsed URL.
 * @throws Error if the URL does not parse with `new URL`, or if JavaScript evaluation is disabled and a disallowed URL is passed,
 * or if file navigations are disabled and a `file:` URL is passed, or if navigating to a restricted scheme.
 */
export declare function validateUrl(url: string, options: ValidateUrlOptions): URL;
