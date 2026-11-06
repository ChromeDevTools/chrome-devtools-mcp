/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import type {ReadonlyServerConfig} from './config/ServerConfig.js';
import {
  fetchWithValidatedRedirects,
  getRedirectHeaders,
  validateNetworkUrl,
} from './utils/network.js';

import {
  type Frame,
  type HTTPRequest,
  Mutex,
  type Page,
  type ResourceType,
} from './third_party/index.js';
import {logger, redactUrlForLogging} from './utils/logger.js';

interface BaseNetworkOverride {
  urlPattern: string;
  resourceType?: ResourceType;
}

export interface NetworkMockFilter {
  urlPattern?: string;
  resourceType?: ResourceType;
}

export interface RedirectNetworkOverrideInput extends NetworkMockFilter {
  kind: 'redirect';
  redirectUrl: string;
}

export interface FileNetworkOverrideInput extends NetworkMockFilter {
  kind: 'file';
  responseFilePath: string;
  contentType?: string;
  loadResponseFile: () => Promise<Uint8Array<ArrayBufferLike>>;
}

export type NetworkMockInput =
  RedirectNetworkOverrideInput | FileNetworkOverrideInput;

interface NetworkOverrideBase extends BaseNetworkOverride {
  id: number;
  diagnostics: {
    hits: number;
    errors: number;
    navigations: number;
    lastError?: string;
  };
}

export interface RedirectNetworkOverride extends NetworkOverrideBase {
  kind: 'redirect';
  redirectUrl: string;
}

export interface FileNetworkOverride extends NetworkOverrideBase {
  kind: 'file';
  responseFilePath: string;
  contentType: string;
}

export type NetworkOverride = RedirectNetworkOverride | FileNetworkOverride;

interface StoredNetworkOverrideBase extends NetworkOverrideBase {
  matcher: RegExp;
}

interface StoredRedirectNetworkOverride extends StoredNetworkOverrideBase {
  kind: 'redirect';
  redirectUrl: string;
}

interface StoredFileNetworkOverride extends StoredNetworkOverrideBase {
  kind: 'file';
  responseFilePath: string;
  contentType: string;
  loadResponseFile: () => Promise<Uint8Array<ArrayBufferLike>>;
}

type StoredNetworkOverride =
  StoredRedirectNetworkOverride | StoredFileNetworkOverride;

const DEFAULT_URL_PATTERN = '*';

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

function escapeRegExpCharacter(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? '\\' + character : character;
}

/**
 * CDP Fetch URL patterns use '*' for any sequence, '?' for one character,
 * and a backslash to escape the next character.
 */
function compileUrlPattern(pattern: string): RegExp {
  let source = '^';
  let escaping = false;

  for (const character of pattern) {
    if (escaping) {
      source += escapeRegExpCharacter(character);
      escaping = false;
      continue;
    }
    if (character === '\\') {
      escaping = true;
      continue;
    }
    if (character === '*') {
      source += '.*';
      continue;
    }
    if (character === '?') {
      source += '.';
      continue;
    }
    source += escapeRegExpCharacter(character);
  }

  if (escaping) {
    source += '\\\\';
  }
  source += '$';
  return new RegExp(source);
}

function toNetworkOverride(override: StoredNetworkOverride): NetworkOverride {
  const base = {
    id: override.id,
    urlPattern: override.urlPattern,
    resourceType: override.resourceType,
    diagnostics: {...override.diagnostics},
  };
  if (override.kind === 'redirect') {
    return {
      ...base,
      kind: override.kind,
      redirectUrl: override.redirectUrl,
    };
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

  #navigationHandler = (frame: Frame): void => {
    if (frame === this.#page.mainFrame()) {
      for (const override of this.#overrides.values()) {
        override.diagnostics.navigations++;
      }
    }
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
    if (this.#page.isClosed()) {
      throw new Error('Cannot update mocks on a closed page.');
    }
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
      matcher: compileUrlPattern(urlPattern),
      diagnostics: {hits: 0, errors: 0, navigations: 0},
    };
    if (input.kind === 'redirect') {
      validateNetworkUrl(new URL(input.redirectUrl), this.config.resolved);
      return {
        ...base,
        kind: input.kind,
        redirectUrl: input.redirectUrl,
      };
    }

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
        logger?.('Failed to dispose network overrides', error);
      }
    });
  }

  async #runLifecycleOperation<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const guard = await this.#lifecycleMutex.acquire();
    try {
      return await operation();
    } finally {
      guard[Symbol.dispose]();
    }
  }

  async #activate(): Promise<void> {
    if (this.#active) {
      return;
    }
    if (this.#page.isClosed()) {
      throw new Error('Cannot add an override to a closed page.');
    }

    this.#page.on('request', this.#requestHandler);
    this.#page.on('framenavigated', this.#navigationHandler);
    try {
      this.#cacheDisabled = true;
      await this.#page.setCacheEnabled(false);
      if (this.#page.isClosed()) {
        throw new Error('Cannot add an override to a closed page.');
      }
      await this.#page.setRequestInterception(true);
      this.#active = true;
      if (this.#page.isClosed()) {
        throw new Error('Cannot add an override to a closed page.');
      }
    } catch (error) {
      let interceptionDisabled = this.#page.isClosed();
      if (!interceptionDisabled) {
        try {
          await this.#page.setRequestInterception(false);
          interceptionDisabled = true;
        } catch (cleanupError) {
          this.#active = true;
          logger?.(
            'Failed to disable request interception after activation failed',
            cleanupError,
          );
        }
      }
      if (interceptionDisabled) {
        this.#active = false;
        this.#removeListeners();
        if (this.#page.isClosed()) {
          this.#cacheDisabled = false;
        } else if (this.#cacheDisabled) {
          try {
            await this.#page.setCacheEnabled(true);
            this.#cacheDisabled = false;
          } catch (cleanupError) {
            logger?.(
              'Failed to restore the cache after activation failed',
              cleanupError,
            );
          }
        }
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
    this.#page.off('framenavigated', this.#navigationHandler);
  }

  async #handleRequest(request: HTTPRequest): Promise<void> {
    if (request.isInterceptResolutionHandled()) {
      return;
    }

    const override = this.#findOverride(request);
    if (!override) {
      await this.#continueRequest(request);
      return;
    }

    override.diagnostics.hits++;
    try {
      if (override.kind === 'redirect') {
        await this.#fulfillUpstream(request, override.redirectUrl);
        return;
      }

      const body = await override.loadResponseFile();
      await request.respond({
        status: 200,
        contentType: override.contentType,
        headers: {
          'Cache-Control': 'no-store',
        },
        body,
      });
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : String(error);
      const source =
        override.kind === 'file'
          ? override.responseFilePath
          : redactUrlForLogging(override.redirectUrl);
      override.diagnostics.errors++;
      override.diagnostics.lastError = (
        'Failed to load ' +
        source +
        ': ' +
        message
      ).replace(/https?:\/\/[^\s"'<>]+/gi, url => redactUrlForLogging(url));
      logger?.('Failed to apply network override ' + override.id);
      await this.#abortRequest(request);
    }
  }

  async #fulfillUpstream(
    request: HTTPRequest,
    redirectUrl: string,
  ): Promise<void> {
    const method = request.method();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new Error('Upstream mocks only support GET and HEAD requests.');
    }
    const headers = getRedirectHeaders(
      new URL(request.url()),
      new URL(redirectUrl),
      request.headers(),
    );
    const response = await fetchWithValidatedRedirects(new URL(redirectUrl), {
      validateUrl: url => validateNetworkUrl(url, this.config.resolved),
      method,
      headers,
    });
    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of response.headers) {
      if (name !== 'content-encoding' && name !== 'content-length') {
        responseHeaders[name] = value;
      }
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
      logger?.('Failed to abort a request after an override error', error);
    }
  }
}
