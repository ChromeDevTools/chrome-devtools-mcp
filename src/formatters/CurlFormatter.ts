/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools, type HTTPRequest} from '../third_party/index.js';

export interface SnippetOptions {
  /**
   * When true, sensitive headers (authorization, cookie, ...) are kept verbatim
   * so the snippet reproduces an authenticated request. Defaults to false.
   */
  includeSensitiveHeaders?: boolean;
}

interface Header {
  name: string;
  value: string;
}

/**
 * HTTP/2 pseudo-headers (`:authority`, ...) and `content-length` are dropped —
 * curl and fetch set those themselves.
 */
function selectHeaders(
  request: HTTPRequest,
  includeSensitive: boolean,
): Header[] {
  const headers: Header[] = Object.entries(request.headers())
    .map(([name, value]) => ({name, value}))
    .filter(header => {
      const lower = header.name.toLowerCase();
      return !header.name.startsWith(':') && lower !== 'content-length';
    });
  if (includeSensitive) {
    return headers;
  }
  return DevTools.NetworkRequestFormatter.sanitizeHeaders(headers);
}

async function loadRequestBody(
  request: HTTPRequest,
): Promise<string | undefined> {
  if (!request.hasPostData()) {
    return undefined;
  }
  try {
    return request.postData() ?? (await request.fetchPostData());
  } catch {
    return undefined;
  }
}

/** Single-quote a value for POSIX shells. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Build a runnable `curl` command that reproduces the request. */
export async function toCurl(
  request: HTTPRequest,
  options: SnippetOptions = {},
): Promise<string> {
  const includeSensitive = options.includeSensitiveHeaders ?? false;
  const headers = selectHeaders(request, includeSensitive);
  const body = await loadRequestBody(request);

  const parts = [`curl -X ${request.method()} ${shellQuote(request.url())}`];
  for (const header of headers) {
    parts.push(`  -H ${shellQuote(`${header.name}: ${header.value}`)}`);
  }
  if (body) {
    parts.push(`  --data-raw ${shellQuote(body)}`);
  }
  return parts.join(' \\\n');
}

/** Build a runnable `fetch()` call that reproduces the request. */
export async function toFetch(
  request: HTTPRequest,
  options: SnippetOptions = {},
): Promise<string> {
  const includeSensitive = options.includeSensitiveHeaders ?? false;
  const headers = selectHeaders(request, includeSensitive);
  const body = await loadRequestBody(request);

  const init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
  } = {
    method: request.method(),
  };
  if (headers.length) {
    init.headers = Object.fromEntries(
      headers.map(header => [header.name, header.value]),
    );
  }
  if (body) {
    init.body = body;
  }
  return `fetch(${JSON.stringify(request.url())}, ${JSON.stringify(init, null, 2)});`;
}
