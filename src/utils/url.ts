/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Node 22 has no global URLPattern. The CLI bundle exports Puppeteer's
// polyfill, so this module does not need the full third-party bundle.
import {URLPattern} from '../third_party/cli.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);
const IPV4_LOOPBACK_REGEX = /^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/;
const IPV4_MAPPED_LOOPBACK_REGEX = /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/;

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

  // 4. Check IPv4-mapped IPv6 loopback. URL serializes [::ffff:127.0.0.1]
  // as [::ffff:7f00:1].
  if (IPV4_MAPPED_LOOPBACK_REGEX.test(hostname)) {
    return true;
  }

  return false;
}

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
 * Checks whether a compiled URLPattern component contains an unescaped `:`
 * (which always represents a `:name` group in URLPattern syntax).
 */
function hasNamedGroup(component: string): boolean {
  return component.replaceAll('\\\\', '').replaceAll('\\:', '').includes(':');
}

/**
 * Checks whether a URLPattern string has a partial IPv4 wildcard in the
 * hostname (for example `127.0.0.*`, `*.0.0.1`, `*1*`, or `{127.0.0.*}`),
 * which Chrome cannot enforce on redirects or subresources.
 */
function hasPartialIpv4Hostname(pattern: string): boolean {
  const authority = /:\/\/([^/?#]+)/.exec(pattern)?.[1] ?? '';
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (hostPort.startsWith('[')) {
    return false;
  }
  const hostname = hostPort.replace(/:.*$/, '');
  if (!hostname.includes('*')) {
    return false;
  }
  const stripped = hostname.replaceAll(/[{}*\\]/g, '').replace(/\.+$/, '');
  const lastLabel = stripped.split('.').at(-1) ?? '';
  return /^(?:\d+|0[xX][0-9a-fA-F]*)$/.test(lastLabel);
}

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
export function validateUrlPatterns(
  patterns: string[],
  flagName: string,
): void {
  for (const raw of patterns) {
    if (hasPartialIpv4Hostname(raw)) {
      throw new Error(
        `Invalid ${flagName} "${raw}": a partial IPv4 wildcard is not enforced on redirects or subresources. Use an exact IPv4 address or a "*" wildcard instead.`,
      );
    }
    let parsed: URLPattern;
    try {
      parsed = new URLPattern(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid ${flagName} "${raw}": ${message}`, {
        cause: error,
      });
    }
    if (parsed.hasRegExpGroups) {
      throw new Error(
        `Invalid ${flagName} "${raw}": a regexp group is not enforced on redirects or subresources. Use an exact value or a "*" wildcard instead.`,
      );
    }
    const components = [
      parsed.protocol,
      parsed.username,
      parsed.password,
      parsed.hostname,
      parsed.port,
      parsed.pathname,
      parsed.search,
      parsed.hash,
    ];
    if (components.some(hasNamedGroup)) {
      throw new Error(
        `Invalid ${flagName} "${raw}": a ":name" named group is not enforced on redirects or subresources. Use an exact value or a "*" wildcard instead.`,
      );
    }
  }
}

/**
 * Reports whether a URL ultimately targets the `file:` scheme.
 *
 * `view-source:` wraps another URL and Chrome resolves the inner target, so
 * `view-source:file:///etc/passwd` reads the file just as `file:///etc/passwd`
 * does. The inner URL is re-parsed rather than string-matched so that an
 * uppercase inner scheme (`view-source:FILE:///etc/passwd`) is normalised.
 *
 * @param url The already-parsed URL to inspect.
 * @returns true if the URL, after unwrapping any `view-source:` prefixes, uses `file:`.
 */
function targetsFileScheme(url: URL): boolean {
  let current = url;
  // Bounded in case of a pathologically nested `view-source:` chain.
  for (let i = 0; i < 5 && current.protocol === 'view-source:'; i++) {
    try {
      current = new URL(current.pathname);
    } catch {
      return false;
    }
  }
  return current.protocol === 'file:';
}

/**
 * Validates a URL string by parsing it with `new URL` and checking for disallowed protocols and restricted schemes.
 *
 * @param url The URL string to validate.
 * @param options Options object containing javascriptEvaluation, categoryExtensions and fileNavigations.
 * @returns The parsed URL.
 * @throws Error if the URL does not parse with `new URL`, or if JavaScript evaluation is disabled and a disallowed URL is passed,
 * or if file navigations are disabled and a `file:` URL is passed, or if navigating to a restricted scheme.
 */
export function validateUrl(url: string, options: ValidateUrlOptions): URL {
  const {javascriptEvaluation, categoryExtensions, fileNavigations} = options;

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

  if (fileNavigations === false && targetsFileScheme(parsed)) {
    throw new Error(
      `Navigating to file: URLs is not allowed when --file-navigations is disabled.`,
    );
  }

  if (parsed.protocol === 'devtools:') {
    throw new Error(`Navigating to devtools: URLs is not allowed.`);
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
