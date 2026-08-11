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
