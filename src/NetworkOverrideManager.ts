/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import {URLPattern} from './third_party/cli.js';
import type {ReadonlyServerConfig} from './config/ServerConfig.js';
import {
  fetchWithValidatedRedirects,
  getRedirectHeaders,
  validateNetworkUrl,
} from './utils/network.js';

import {
  type HTTPRequest,
  Mutex,
  type Page,
  type ResourceType,
} from './third_party/index.js';
import {logger, redactUrlForLogging} from './utils/logger.js';

interface BaseNetworkOverride {
  urlPattern: string;
  resourceType?: ResourceType;
  abort?: boolean;
  allowOrigin?: string;
}

export interface NetworkMockFilter {
  urlPattern?: string;
  resourceType?: ResourceType;
}

interface NetworkMockActions {
  abort?: boolean;
  allowOrigin?: string;
}

export interface UpstreamNetworkOverrideInput extends NetworkMockFilter {
  kind: 'upstream';
  upstreamUrl: string;
}

export interface FileNetworkOverrideInput extends NetworkMockFilter {
  kind: 'file';
  responseFilePath: string;
  contentType?: string;
  loadResponseFile: () => Promise<Uint8Array<ArrayBufferLike>>;
}

export type NetworkMockInput = NetworkMockActions &
  (
    | UpstreamNetworkOverrideInput
    | FileNetworkOverrideInput
    | (NetworkMockFilter & {kind?: undefined})
  );

interface NetworkOverrideBase extends BaseNetworkOverride {
  id: number;
  diagnostics: {
    hits: number;
    errors: number;
    navigations: number;
    lastError?: string;
  };
}

export interface UpstreamNetworkOverride extends NetworkOverrideBase {
  kind: 'upstream';
  upstreamUrl: string;
}

export interface FileNetworkOverride extends NetworkOverrideBase {
  kind: 'file';
  responseFilePath: string;
  contentType: string;
}

export interface PassthroughNetworkOverride extends NetworkOverrideBase {
  kind: 'passthrough';
}

export type NetworkOverride =
  UpstreamNetworkOverride | FileNetworkOverride | PassthroughNetworkOverride;

interface StoredNetworkOverrideBase extends NetworkOverrideBase {
  matcher: URLPattern;
}

interface StoredUpstreamNetworkOverride extends StoredNetworkOverrideBase {
  kind: 'upstream';
  upstreamUrl: string;
}

interface StoredFileNetworkOverride extends StoredNetworkOverrideBase {
  kind: 'file';
  responseFilePath: string;
  contentType: string;
  loadResponseFile: () => Promise<Uint8Array<ArrayBufferLike>>;
}

type StoredNetworkOverride =
  | StoredUpstreamNetworkOverride
  | StoredFileNetworkOverride
  | (StoredNetworkOverrideBase & {kind: 'passthrough'});

const DEFAULT_URL_PATTERN = '*://*:*/*';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function inferContentType(filePath: string): string {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    'application/octet-stream'
  );
}

function toNetworkOverride(override: StoredNetworkOverride): NetworkOverride {
  const base = {
    id: override.id,
    urlPattern: override.urlPattern,
    resourceType: override.resourceType,
    abort: override.abort,
    allowOrigin: override.allowOrigin,
    diagnostics: {...override.diagnostics},
  };
  if (override.kind === 'upstream') {
    return {
      ...base,
      kind: override.kind,
      upstreamUrl: override.upstreamUrl,
    };
  }
  if (override.kind === 'passthrough') {
    return {...base, kind: override.kind};
  }
  return {
    ...base,
    kind: override.kind,
    responseFilePath: override.responseFilePath,
    contentType: override.contentType,
  };
}

function matchesFilter(
  override: BaseNetworkOverride,
  filter: NetworkMockFilter,
): boolean {
  return (
    (filter.urlPattern === undefined ||
      override.urlPattern === filter.urlPattern) &&
    (filter.resourceType === undefined ||
      override.resourceType === filter.resourceType)
  );
}

export class NetworkOverrideManager {
  #page: Page;
  #overrides = new Map<number, StoredNetworkOverride>();
  #nextId = 1;
  #active = false;
  #cacheDisabled = false;
  #disposed = false;
  #lifecycleMutex = new Mutex();

  #requestHandler = (request: HTTPRequest): Promise<void> => {
    return this.#handleRequest(request);
  };

  constructor(
    page: Page,
    private readonly config: ReadonlyServerConfig,
  ) {
    this.#page = page;
  }

  async mock(input: NetworkMockInput): Promise<NetworkOverride> {
    return await this.#runLifecycleOperation(() => this.#mock(input));
  }

  async #mock(input: NetworkMockInput): Promise<NetworkOverride> {
    if (this.#disposed) {
      throw new Error('Cannot update mocks after the page was disposed.');
    }
    const urlPattern = input.urlPattern ?? DEFAULT_URL_PATTERN;
    const existing = [...this.#overrides.values()].find(
      override =>
        override.urlPattern === urlPattern &&
        override.resourceType === input.resourceType,
    );
    const override = await this.#createOverride(input, existing);
    const previous = this.#overrides;
    const overrides = new Map(previous);
    overrides.delete(override.id);
    overrides.set(override.id, override);
    this.#overrides = overrides;
    try {
      await this.#activate();
    } catch (error) {
      this.#overrides = previous;
      throw error;
    }
    if (!existing) {
      this.#nextId++;
    }
    return toNetworkOverride(override);
  }

  async #createOverride(
    input: NetworkMockInput,
    existing?: StoredNetworkOverride,
  ): Promise<StoredNetworkOverride> {
    const urlPattern = input.urlPattern ?? DEFAULT_URL_PATTERN;
    const base = {
      id: existing?.id ?? this.#nextId,
      urlPattern,
      resourceType: input.resourceType,
      abort: input.abort ?? existing?.abort ?? false,
      allowOrigin: input.allowOrigin ?? existing?.allowOrigin,
      matcher: new URLPattern(urlPattern),
      diagnostics: {hits: 0, errors: 0, navigations: 0},
    };
    if (input.kind === 'upstream') {
      validateNetworkUrl(new URL(input.upstreamUrl), this.config.resolved);
      return {
        ...base,
        kind: input.kind,
        upstreamUrl: input.upstreamUrl,
      };
    }
    if (input.kind === 'file') {
      await input.loadResponseFile();
      return {
        ...base,
        kind: input.kind,
        responseFilePath: input.responseFilePath,
        contentType:
          input.contentType ?? inferContentType(input.responseFilePath),
        loadResponseFile: input.loadResponseFile,
      };
    }
    if (
      base.allowOrigin !== undefined &&
      (!existing || existing.kind === 'passthrough')
    ) {
      throw new Error(
        'allowOrigin requires a body or upstream source on the mock.',
      );
    }
    return existing ? {...existing, ...base} : {...base, kind: 'passthrough'};
  }

  list(filter: NetworkMockFilter = {}): NetworkOverride[] {
    const overrides: NetworkOverride[] = [];
    for (const override of this.#overrides.values()) {
      if (matchesFilter(override, filter)) {
        overrides.push(toNetworkOverride(override));
      }
    }
    return overrides;
  }

  async remove(filter: NetworkMockFilter): Promise<number> {
    return await this.#runLifecycleOperation(async () => {
      if (this.#disposed) {
        throw new Error('Cannot remove mocks after the page was disposed.');
      }
      const overrides = new Map(this.#overrides);
      for (const [id, override] of overrides) {
        if (matchesFilter(override, filter)) {
          overrides.delete(id);
        }
      }
      const removed = this.#overrides.size - overrides.size;
      if (removed === 0) {
        return 0;
      }
      if (overrides.size === 0) {
        try {
          await this.#deactivate();
        } catch (error) {
          try {
            await this.#activate();
          } catch (restoreError) {
            logger?.(
              'Failed to restore network mocks after removal failed',
              restoreError,
            );
          }
          throw error;
        }
      }
      this.#overrides = overrides;
      return removed;
    });
  }

  async dispose(): Promise<void> {
    await this.#runLifecycleOperation(async () => {
      if (this.#disposed) {
        return;
      }
      this.#disposed = true;
      this.#overrides.clear();
      try {
        await this.#deactivate();
      } catch (error) {
        logger?.('Failed to dispose network mocks', error);
      }
    });
  }

  async #runLifecycleOperation<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    using guard = await this.#lifecycleMutex.acquire();
    return await operation();
  }

  async #activate(): Promise<void> {
    if (this.#active) {
      return;
    }
    if (this.#page.isClosed()) {
      throw new Error('Cannot add a network mock to a closed page.');
    }

    this.#page.on('request', this.#requestHandler);
    try {
      this.#cacheDisabled = true;
      await this.#page.setCacheEnabled(false);
      this.#active = true;
      await this.#page.setRequestInterception(true);
    } catch (error) {
      try {
        await this.#deactivate();
      } catch (cleanupError) {
        logger?.('Failed to clean up network mock activation', cleanupError);
      }
      throw error;
    }
  }

  async #deactivate(): Promise<void> {
    if (this.#page.isClosed()) {
      this.#active = false;
      this.#cacheDisabled = false;
      this.#removeListeners();
      return;
    }

    if (this.#active) {
      await this.#page.setRequestInterception(false);
      this.#active = false;
    }
    this.#removeListeners();
    if (this.#cacheDisabled) {
      await this.#page.setCacheEnabled(true);
      this.#cacheDisabled = false;
    }
  }

  #findOverride(request: HTTPRequest): StoredNetworkOverride | undefined {
    const overrides = [...this.#overrides.values()];
    for (let index = overrides.length - 1; index >= 0; index--) {
      const override = overrides[index];
      if (!override) {
        continue;
      }
      if (!override.matcher.test(request.url())) {
        continue;
      }
      if (
        override.resourceType &&
        override.resourceType !== request.resourceType()
      ) {
        continue;
      }
      return override;
    }
    return undefined;
  }

  #removeListeners(): void {
    this.#page.off('request', this.#requestHandler);
  }

  async #handleRequest(request: HTTPRequest): Promise<void> {
    if (
      request.resourceType() === 'document' &&
      request.frame() === this.#page.mainFrame()
    ) {
      for (const override of this.#overrides.values()) {
        override.diagnostics.navigations++;
      }
    }
    if (request.isInterceptResolutionHandled()) {
      return;
    }

    const override = this.#findOverride(request);
    if (!override) {
      await this.#continueRequest(request);
      return;
    }

    override.diagnostics.hits++;
    if (override.abort) {
      await this.#abortRequest(request);
      return;
    }
    if (override.kind === 'passthrough') {
      await this.#continueRequest(request);
      return;
    }
    try {
      if (override.kind === 'upstream') {
        await this.#fulfillUpstream(
          request,
          override.upstreamUrl,
          override.allowOrigin,
        );
        return;
      }
      const body = await override.loadResponseFile();
      await request.respond({
        status: 200,
        contentType: override.contentType,
        headers: {
          'Cache-Control': 'no-store',
          ...(override.allowOrigin !== undefined
            ? {'Access-Control-Allow-Origin': override.allowOrigin}
            : {}),
        },
        body,
      });
    } catch (error) {
      const message: string =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : String(error);
      const source =
        override.kind === 'file'
          ? override.responseFilePath
          : redactUrlForLogging(override.upstreamUrl);
      const detail =
        override.kind === 'file'
          ? message
          : message.replace(/https?:\/\/[^\s"'<>]+/gi, url =>
              redactUrlForLogging(url),
            );
      override.diagnostics.errors++;
      override.diagnostics.lastError =
        'Failed to load ' + source + ': ' + detail;
      logger?.('Failed to apply network mock ' + override.id);
      await this.#abortRequest(request);
    }
  }

  async #fulfillUpstream(
    request: HTTPRequest,
    upstreamUrl: string,
    allowOrigin?: string,
  ): Promise<void> {
    const method = request.method();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new Error('Upstream mocks only support GET and HEAD requests.');
    }
    const headers = getRedirectHeaders(
      new URL(request.url()),
      new URL(upstreamUrl),
      request.headers(),
    );
    const response = await fetchWithValidatedRedirects(new URL(upstreamUrl), {
      policy: this.config.resolved,
      method,
      headers,
    });
    const responseHeaders: Record<string, string | string[]> = {};
    for (const [name, value] of response.headers) {
      if (
        name !== 'content-encoding' &&
        name !== 'content-length' &&
        name !== 'set-cookie'
      ) {
        responseHeaders[name] = value;
      }
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) {
      responseHeaders['set-cookie'] = cookies;
    }
    if (allowOrigin !== undefined) {
      responseHeaders['access-control-allow-origin'] = allowOrigin;
    }
    await request.respond({
      status: response.status,
      headers: responseHeaders,
      body: new Uint8Array(await response.arrayBuffer()),
    });
  }

  async #continueRequest(request: HTTPRequest): Promise<void> {
    if (request.isInterceptResolutionHandled()) {
      return;
    }
    try {
      await request.continue();
    } catch (error) {
      logger?.('Failed to continue an intercepted network request', error);
    }
  }

  async #abortRequest(request: HTTPRequest): Promise<void> {
    if (request.isInterceptResolutionHandled()) {
      return;
    }
    try {
      await request.abort('failed');
    } catch (error) {
      logger?.('Failed to abort an intercepted network request', error);
    }
  }
}
