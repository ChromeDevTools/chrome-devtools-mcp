/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);
const IPV4_LOOPBACK_REGEX = /^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/;

/**
 * Determines whether a given URL string points to a localhost / loopback address.
 *
 * @param url The URL string to test.
 * @returns true if the URL is a valid network URL pointing to localhost or a loopback IP.
 */
export function isLocalhost(url?: string): boolean {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

  // 1. Check localhost and RFC 6761 *.localhost subdomains
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return true;
  }

  // 2. Check IPv6 loopback ([::1] as returned by URL.hostname, or ::1)
  if (hostname === '[::1]' || hostname === '::1') {
    return true;
  }

  // 3. Check IPv4 loopback (127.0.0.0/8)
  if (IPV4_LOOPBACK_REGEX.test(hostname)) {
    return true;
  }

  return false;
}

export interface ValidateUrlOptions {
  javascriptEvaluation: boolean | undefined;
  categoryExtensions: boolean | undefined;
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
export function isAllowedUrl(
  url: string,
  options: IsAllowedUrlOptions,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol === 'chrome:') {
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host === 'newtab' || host === 'new-tab-page' || host === 'inspect') {
      return true;
    }
    if (
      host === '' &&
      (path === 'newtab' ||
        path === 'new-tab-page' ||
        path.startsWith('inspect'))
    ) {
      return true;
    }
  }

  if (
    parsed.protocol === 'chrome:' ||
    parsed.protocol === 'chrome-untrusted:'
  ) {
    return false;
  }
  if (!options.categoryExtensions && parsed.protocol === 'chrome-extension:') {
    return false;
  }

  return true;
}

const DISALLOWED_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:']);

/**
 * Validates a URL string by parsing it with `new URL` and checking for disallowed protocols and restricted schemes.
 *
 * @param url The URL string to validate.
 * @param options Options object containing javascriptEvaluation and categoryExtensions.
 * @returns The parsed URL.
 * @throws Error if the URL does not parse with `new URL`, or if JavaScript evaluation is disabled and a disallowed URL is passed,
 * or if navigating to a restricted scheme.
 */
export function validateUrl(url: string, options: ValidateUrlOptions): URL {
  const {javascriptEvaluation, categoryExtensions} = options;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Invalid URL: "${url}". URLs must be valid according to the URL standard.`,
    );
  }

  if (
    javascriptEvaluation === false &&
    DISALLOWED_PROTOCOLS.has(parsed.protocol)
  ) {
    throw new Error(
      `Navigating to ${parsed.protocol} URLs is not allowed when JavaScript evaluation is disabled.`,
    );
  }

  if (!isAllowedUrl(url, {categoryExtensions})) {
    if (parsed.protocol === 'chrome-extension:') {
      throw new Error(
        `Navigating to chrome-extension: URLs is not allowed without --categoryExtensions.`,
      );
    }
    throw new Error(`Navigating to ${parsed.protocol} URLs is not allowed.`);
  }

  return parsed;
}
