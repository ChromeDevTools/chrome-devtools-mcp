/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {CdpCDPSession} from '../third_party/index.js';

import type {Context} from '../tools/ToolDefinition.js';

/**
 * @fileoverview Lighthouse's `Fetcher` utility (used by the robots-txt,
 * llms-txt, and source-maps gatherers) fetches resources via the CDP command
 * `Network.loadNetworkResource`, which is documented to ignore normal
 * browser network constraints such as CORS. It is not covered by Puppeteer's
 * `--allowedUrlPattern`/`--blockedUrlPattern` guardrail (implemented via
 * `Network.emulateNetworkConditionsByRule`, which only governs page-initiated
 * traffic) and does not surface via any CDP Network domain event, so a
 * redirect it follows is invisible to every observation point this repo or
 * Puppeteer expose (see GitHub issue #2567).
 *
 * This module closes that gap by intercepting `Network.loadNetworkResource`
 * (and the matching `IO.read` calls needed to service it) at the shared
 * Puppeteer `CdpCDPSession` class level -- every CDP session, including the
 * one Lighthouse creates for itself, funnels through the same `send` method.
 * While installed, a `Network.loadNetworkResource` call is fulfilled by a
 * Node-side fetch that validates the initial URL and every redirect hop
 * against the configured guardrail before following it. All other CDP
 * traffic passes through unmodified.
 */

const MAX_REDIRECTS = 20;

interface LoadNetworkResourceParams {
  frameId?: string;
  url: string;
  options?: {disableCache?: boolean; includeCredentials?: boolean};
}

interface IoReadParams {
  handle?: string;
}

/**
 * Installs the guarded-fetch interception for the lifetime of the returned
 * restore function's caller. Returns a no-op restore function, without
 * touching the shared prototype at all, when no guardrail is configured --
 * behavior is then byte-for-byte unchanged.
 */
export function installGuardedNetworkFetch(context: Context): () => void {
  if (!context.hasNetworkBlockOrAllowlist()) {
    return () => {
      // no-op: the prototype was never touched.
    };
  }

  const CdpCDPSessionPrototype = CdpCDPSession.prototype as unknown as {
    send: (
      method: string,
      params?: unknown,
      options?: unknown,
    ) => Promise<unknown>;
  };
  const originalSend = CdpCDPSessionPrototype.send;
  const mintedStreams = new Map<string, string>();
  let nextHandle = 1;

  CdpCDPSessionPrototype.send = async function (
    this: unknown,
    method: string,
    params?: unknown,
    options?: unknown,
  ): Promise<unknown> {
    if (method === 'IO.read') {
      const handle = (params as IoReadParams | undefined)?.handle;
      if (handle !== undefined && mintedStreams.has(handle)) {
        const data = mintedStreams.get(handle)!;
        mintedStreams.delete(handle);
        return {data, eof: true, base64Encoded: false};
      }
      return originalSend.call(this, method, params, options);
    }

    if (method !== 'Network.loadNetworkResource') {
      return originalSend.call(this, method, params, options);
    }

    const request = params as LoadNetworkResourceParams;
    try {
      const {status, content} = await fetchWithGuardedRedirects(
        context,
        request.url,
        cookieUrl =>
          originalSend.call(this, 'Network.getCookies', {
            urls: [cookieUrl],
          }) as Promise<{cookies?: Array<{name: string; value: string}>}>,
      );
      const handle = `guarded-fetch-${nextHandle++}`;
      mintedStreams.set(handle, content);
      return {
        resource: {success: true, httpStatusCode: status, stream: handle},
      };
    } catch {
      return {
        resource: {success: false},
      };
    }
  };

  return () => {
    CdpCDPSessionPrototype.send = originalSend;
  };
}

async function fetchWithGuardedRedirects(
  context: Context,
  initialUrl: string,
  getCookiesForUrl: (
    url: string,
  ) => Promise<{cookies?: Array<{name: string; value: string}>}>,
): Promise<{status: number; content: string}> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    context.validateUrlForGuardedFetch(new URL(currentUrl));

    const headers: Record<string, string> = {};
    try {
      const {cookies} = await getCookiesForUrl(currentUrl);
      if (cookies?.length) {
        headers['Cookie'] = cookies
          .map(cookie => `${cookie.name}=${cookie.value}`)
          .join('; ');
      }
    } catch {
      // Best-effort: proceed without forwarding cookies rather than failing
      // the whole fetch over a cookie-lookup error.
    }

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(
          `Redirect from ${currentUrl} had no Location header.`,
        );
      }
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    const content = await response.text();
    return {status: response.status, content};
  }
  throw new Error(
    `Exceeded ${MAX_REDIRECTS} redirects fetching ${initialUrl}.`,
  );
}
