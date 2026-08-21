/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {CdpCDPSession} from '../third_party/index.js';
import type {Context} from '../tools/ToolDefinition.js';
import {createIdGenerator} from './id.js';

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
const FETCH_TIMEOUT_MS = 10_000;

interface LoadNetworkResourceParams {
  frameId?: string;
  url: string;
  options?: {disableCache?: boolean; includeCredentials?: boolean};
}

interface IoReadParams {
  handle?: string;
}

type SendFn = (
  method: string,
  params?: unknown,
  options?: unknown,
) => Promise<unknown>;

const CdpCDPSessionPrototype = CdpCDPSession.prototype as unknown as {
  send: SendFn;
};

// Module-level so overlapping installs (e.g. two concurrent lighthouse_audit
// calls, should the caller's serialization ever be relaxed) stack safely
// instead of racing on the shared class prototype: only the first install
// patches `send`, only the last matching restore unpatches it, and every
// currently-active install's guardrail is consulted on each intercepted
// call rather than just whichever one happened to patch the prototype.
let installCount = 0;
let originalSend: SendFn | undefined;
const activeContexts = new Set<Context>();
const mintedStreams = new Map<string, string>();
const nextHandleId = createIdGenerator();

/**
 * Installs the guarded-fetch interception for the lifetime of the returned
 * restore function's caller. Returns a no-op restore function, without
 * touching the shared prototype at all, when no guardrail is configured --
 * behavior is then byte-for-byte unchanged. Safe to call while another
 * install from a different context is still active; the returned restore
 * function is idempotent.
 */
export function installGuardedNetworkFetch(context: Context): () => void {
  if (!context.hasNetworkBlockOrAllowlist()) {
    return () => {
      // no-op: the prototype was never touched.
    };
  }

  activeContexts.add(context);
  if (installCount === 0) {
    originalSend = CdpCDPSessionPrototype.send;
    CdpCDPSessionPrototype.send = guardedSend;
  }
  installCount++;

  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;
    activeContexts.delete(context);
    installCount--;
    if (installCount === 0) {
      CdpCDPSessionPrototype.send = originalSend!;
      originalSend = undefined;
    }
  };
}

function validateAgainstEveryActiveGuardrail(url: URL): void {
  for (const context of activeContexts) {
    context.validateUrlForGuardedFetch(url);
  }
}

const guardedSend: SendFn = async function (
  this: unknown,
  method: string,
  params?: unknown,
  options?: unknown,
): Promise<unknown> {
  const original = originalSend;

  if (method === 'IO.read') {
    const handle = (params as IoReadParams | undefined)?.handle;
    if (handle !== undefined) {
      const data = mintedStreams.get(handle);
      if (data !== undefined) {
        mintedStreams.delete(handle);
        return {data, eof: true, base64Encoded: false};
      }
    }
    return original!.call(this, method, params, options);
  }

  if (method !== 'Network.loadNetworkResource') {
    return original!.call(this, method, params, options);
  }

  const request = params as LoadNetworkResourceParams;
  try {
    const {status, content} = await fetchWithGuardedRedirects(
      request.url,
      request.options?.includeCredentials
        ? cookieUrl =>
            original!.call(this, 'Network.getCookies', {
              urls: [cookieUrl],
            }) as Promise<{cookies?: Array<{name: string; value: string}>}>
        : undefined,
    );
    const handle = `guarded-fetch-${nextHandleId()}`;
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

async function fetchWithGuardedRedirects(
  initialUrl: string,
  getCookiesForUrl:
    | ((
        url: string,
      ) => Promise<{cookies?: Array<{name: string; value: string}>}>)
    | undefined,
): Promise<{status: number; content: string}> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    validateAgainstEveryActiveGuardrail(new URL(currentUrl));

    const headers: Record<string, string> = {};
    try {
      const {cookies} = (await getCookiesForUrl?.(currentUrl)) ?? {};
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
