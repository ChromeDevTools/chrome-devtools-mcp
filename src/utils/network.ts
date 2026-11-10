/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {URLPattern} from '../third_party/cli.js';
import {redactUrlForLogging} from './logger.js';

interface UrlAccessPolicy {
  blockedUrlPattern?: readonly string[];
  allowedUrlPattern?: readonly string[];
}

const CROSS_ORIGIN_REDIRECT_HEADERS = new Set([
  'accept',
  'accept-language',
  'cache-control',
  'origin',
  'pragma',
  'range',
  'user-agent',
]);

export function getRedirectHeaders(
  sourceUrl: URL,
  targetUrl: URL,
  originalHeaders: Record<string, string>,
): Record<string, string> {
  const sameOrigin = sourceUrl.origin === targetUrl.origin;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(originalHeaders)) {
    const lowerName = name.toLowerCase();
    if (lowerName === 'accept-encoding') {
      continue;
    }
    if (sameOrigin || CROSS_ORIGIN_REDIRECT_HEADERS.has(lowerName)) {
      headers[name] = value;
    }
  }
  return headers;
}

export function validateUrlNotBlocked(
  url: URL,
  blocklist?: readonly string[],
): void {
  for (const block of blocklist ?? []) {
    if (new URLPattern(block).test(url)) {
      throw new Error('Blocked by blocklist: ' + redactUrlForLogging(url.href));
    }
  }
}

export function validateNetworkUrl(url: URL, policy: UrlAccessPolicy): void {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Unsupported URL protocol: ' + url.protocol);
  }
  validateUrlNotBlocked(url, policy.blockedUrlPattern);
  if (
    policy.allowedUrlPattern &&
    !policy.allowedUrlPattern.some(allow => new URLPattern(allow).test(url))
  ) {
    throw new Error(
      'Not allowed by allowlist: ' + redactUrlForLogging(url.href),
    );
  }
}

export async function fetchWithValidatedRedirects(
  url: URL,
  options: {
    policy: UrlAccessPolicy;
    method?: 'GET' | 'HEAD';
    headers?: Record<string, string>;
  },
): Promise<Response> {
  const redirectStatuses = new Set([301, 302, 303, 307, 308]);
  const maxRedirects = 20;
  let currentUrl = url;
  let headers = options.headers
    ? Object.fromEntries(new Headers(options.headers))
    : undefined;
  for (let redirectCount = 0; ; redirectCount++) {
    validateNetworkUrl(currentUrl, options.policy);
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      ...(options.method ? {method: options.method} : {}),
      ...(headers ? {headers} : {}),
    });
    if (!redirectStatuses.has(response.status)) {
      return response;
    }
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) {
      throw new Error(
        'Redirect has no Location header: ' +
          redactUrlForLogging(currentUrl.href),
      );
    }
    if (redirectCount >= maxRedirects) {
      throw new Error(
        'Too many redirects loading resource: ' + redactUrlForLogging(url.href),
      );
    }
    const nextUrl = new URL(location, currentUrl);
    if (headers) {
      headers = getRedirectHeaders(currentUrl, nextUrl, headers);
    }
    currentUrl = nextUrl;
  }
}
