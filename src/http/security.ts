/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import {isIP} from 'node:net';

import {isLoopbackHost} from '../config/http-options.js';
import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from '../third_party/index.js';

export interface HttpSecurityOptions {
  host: string;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  httpToken?: string;
}

const BEARER_HEADER_PATTERN = /^Bearer\s+(\S+)$/i;
const SCHEME_WILDCARD_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/\*$/i;

/**
 * Formats a host string for embedding in a URL authority by bracketing raw
 * IPv6 literals (for example `::1` -> `[::1]`) while leaving already-bracketed
 * IPv6 literals, IPv4 addresses, and hostnames untouched.
 */
export function formatHostForUrl(host: string): string {
  const trimmed = host.trim();
  if (isIP(trimmed) === 6) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

function normalizeHostname(entry: string): string | undefined {
  const trimmed = entry.trim();
  if (!trimmed) {
    return undefined;
  }
  const formatted = formatHostForUrl(trimmed);
  try {
    return new URL(`http://${formatted}`).hostname;
  } catch {
    return formatted.toLowerCase();
  }
}

function isWildcardHost(normalizedHost: string): boolean {
  return normalizedHost === '0.0.0.0' || normalizedHost === '[::]';
}

/**
 * Builds the deduplicated list of hostnames accepted in the HTTP `Host` header.
 * Wildcard bind addresses (`0.0.0.0`, `::`, `[::]`) are never added as literal
 * allowed hosts; instead localhost hostnames plus any user-supplied extras are
 * permitted.
 */
export function buildAllowedHostnames(
  host: string,
  extra?: readonly string[],
): string[] {
  const allowed = new Set<string>();
  const normalizedHost = normalizeHostname(host);
  const wildcard =
    normalizedHost !== undefined && isWildcardHost(normalizedHost);

  if (isLoopbackHost(host) || wildcard) {
    for (const localhostHost of localhostAllowedHostnames()) {
      allowed.add(localhostHost);
    }
  }

  if (normalizedHost !== undefined && !wildcard) {
    allowed.add(normalizedHost);
  }

  if (extra) {
    for (const entry of extra) {
      const normalized = normalizeHostname(entry);
      if (normalized !== undefined) {
        allowed.add(normalized);
      }
    }
  }

  return Array.from(allowed);
}

/**
 * Builds the deduplicated list of origin hostnames (or `<scheme>://*` patterns)
 * accepted in the HTTP `Origin` header, starting from localhost origins.
 */
export function buildAllowedOrigins(extra?: readonly string[]): string[] {
  const allowed = new Set<string>(localhostAllowedOrigins());

  if (extra) {
    for (const entry of extra) {
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      if (SCHEME_WILDCARD_PATTERN.test(trimmed)) {
        allowed.add(trimmed.toLowerCase());
        continue;
      }
      const normalized = normalizeHostname(trimmed);
      if (normalized !== undefined) {
        allowed.add(normalized);
      }
    }
  }

  return Array.from(allowed);
}

/**
 * Verifies an HTTP `Authorization` header against a static Bearer token using
 * SHA-256 digests and `crypto.timingSafeEqual` to avoid length and timing
 * side-channels.
 */
export function verifyStaticBearerToken(
  authorizationHeader: string | null,
  expectedToken: string,
): boolean {
  if (authorizationHeader === null || expectedToken.length === 0) {
    return false;
  }
  const match = BEARER_HEADER_PATTERN.exec(authorizationHeader);
  if (!match) {
    return false;
  }
  const receivedDigest = crypto
    .createHash('sha256')
    .update(match[1], 'utf8')
    .digest();
  const expectedDigest = crypto
    .createHash('sha256')
    .update(expectedToken, 'utf8')
    .digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

/**
 * Returns a `Response` with standard HTTP security headers applied without
 * mutating the original response's headers, preserving status and streaming
 * body.
 */
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Creates a request security gate enforcing Host header validation, Origin
 * header validation, and optional static Bearer token authentication.
 */
export function createSecurityGate(
  options: HttpSecurityOptions,
): (request: Request) => Response | undefined {
  const allowedHostnames = buildAllowedHostnames(
    options.host,
    options.allowedHosts,
  );
  const allowedOrigins = buildAllowedOrigins(options.allowedOrigins);

  return (request: Request): Response | undefined => {
    const hostRejected = hostHeaderValidationResponse(
      request,
      allowedHostnames,
    );
    if (hostRejected) {
      return applySecurityHeaders(hostRejected);
    }

    const originRejected = originValidationResponse(request, allowedOrigins);
    if (originRejected) {
      return applySecurityHeaders(originRejected);
    }

    if (
      options.httpToken !== undefined &&
      !verifyStaticBearerToken(
        request.headers.get('authorization'),
        options.httpToken,
      )
    ) {
      return applySecurityHeaders(
        Response.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Unauthorized',
            },
            id: null,
          },
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate': 'Bearer',
            },
          },
        ),
      );
    }

    return undefined;
  };
}
