/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import type {HTTPRequest, Page, ResourceType} from './third_party/index.js';
import {logger} from './utils/logger.js';
import {Mutex} from './utils/Mutex.js';

interface BaseNetworkOverride {
  urlPattern: string;
  resourceType?: ResourceType;
}

export interface RedirectNetworkOverrideInput extends BaseNetworkOverride {
  kind: 'redirect';
  redirectUrl: string;
}

export interface FileNetworkOverrideInput extends BaseNetworkOverride {
  kind: 'file';
  responseFilePath: string;
  contentType?: string;
  loadResponseFile: () => Promise<Uint8Array<ArrayBufferLike>>;
}

export type NetworkOverrideInput =
  RedirectNetworkOverrideInput | FileNetworkOverrideInput;

interface NetworkOverrideBase extends BaseNetworkOverride {
  id: number;
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

const SENSITIVE_REDIRECT_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
]);

const CROSS_ORIGIN_REDIRECT_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'origin',
  'pragma',
  'range',
  'user-agent',
]);

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
  if (override.kind === 'redirect') {
    return {
      id: override.id,
      kind: override.kind,
      urlPattern: override.urlPattern,
      resourceType: override.resourceType,
      redirectUrl: override.redirectUrl,
    };
  }
  return {
    id: override.id,
    kind: override.kind,
    urlPattern: override.urlPattern,
    resourceType: override.resourceType,
    responseFilePath: override.responseFilePath,
    contentType: override.contentType,
  };
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

  constructor(page: Page) {
    this.#page = page;
  }

  async add(input: NetworkOverrideInput): Promise<NetworkOverride> {
    return await this.#runLifecycleOperation(() => this.#add(input));
  }

  async #add(input: NetworkOverrideInput): Promise<NetworkOverride> {
    if (this.#disposed) {
      throw new Error('Cannot add an override after the page was disposed.');
    }
    const id = this.#nextId++;
    let override: StoredNetworkOverride;
    if (input.kind === 'redirect') {
      override = {
        id,
        kind: input.kind,
        urlPattern: input.urlPattern,
        resourceType: input.resourceType,
        matcher: compileUrlPattern(input.urlPattern),
        redirectUrl: input.redirectUrl,
      };
    } else {
      await input.loadResponseFile();
      if (this.#disposed) {
        throw new Error('Cannot add an override after the page was disposed.');
      }
      override = {
        id,
        kind: input.kind,
        urlPattern: input.urlPattern,
        resourceType: input.resourceType,
        matcher: compileUrlPattern(input.urlPattern),
        responseFilePath: input.responseFilePath,
        contentType:
          input.contentType ?? inferContentType(input.responseFilePath),
        loadResponseFile: input.loadResponseFile,
      };
    }

    const needsActivation = this.#overrides.size === 0;
    this.#overrides.set(id, override);
    try {
      if (needsActivation) {
        await this.#activate();
      }
    } catch (error) {
      this.#overrides.delete(id);
      throw error;
    }
    return toNetworkOverride(override);
  }

  list(): NetworkOverride[] {
    const overrides: NetworkOverride[] = [];
    for (const override of this.#overrides.values()) {
      overrides.push(toNetworkOverride(override));
    }
    return overrides;
  }

  async remove(id: number): Promise<boolean> {
    return await this.#runLifecycleOperation(() => this.#remove(id));
  }

  async #remove(id: number): Promise<boolean> {
    if (this.#disposed) {
      throw new Error('Cannot remove an override after the page was disposed.');
    }
    if (!this.#overrides.has(id)) {
      return false;
    }
    if (this.#overrides.size === 1) {
      await this.#deactivate();
    }
    this.#overrides.delete(id);
    return true;
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
      guard.dispose();
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
        this.#page.off('request', this.#requestHandler);
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
      this.#page.off('request', this.#requestHandler);
      return;
    }

    if (this.#active) {
      await this.#page.setRequestInterception(false);
      this.#active = false;
      this.#page.off('request', this.#requestHandler);
    } else {
      this.#page.off('request', this.#requestHandler);
    }
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

  async #handleRequest(request: HTTPRequest): Promise<void> {
    if (request.isInterceptResolutionHandled()) {
      return;
    }

    const override = this.#findOverride(request);
    if (!override) {
      await this.#continueRequest(request);
      return;
    }

    try {
      if (override.kind === 'redirect') {
        if (
          this.#isCrossOrigin(request.url(), override.redirectUrl) &&
          request.method() !== 'GET' &&
          request.method() !== 'HEAD'
        ) {
          throw new Error(
            'Cross-origin redirects only support GET and HEAD requests.',
          );
        }
        const headers = this.#redirectHeaders(
          request.url(),
          override.redirectUrl,
          request.headers(),
        );
        if (headers) {
          await request.continue({url: override.redirectUrl, headers});
        } else {
          await request.continue({url: override.redirectUrl});
        }
        return;
      }

      const body = await override.loadResponseFile();
      await request.respond({
        status: 200,
        contentType: override.contentType,
        headers: {'Cache-Control': 'no-store'},
        body,
      });
    } catch (error) {
      logger?.(
        'Failed to apply network override ' + override.id,
        request.url(),
        error,
      );
      await this.#abortRequest(request);
    }
  }

  #isCrossOrigin(sourceUrl: string, redirectUrl: string): boolean {
    return new URL(sourceUrl).origin !== new URL(redirectUrl).origin;
  }

  #redirectHeaders(
    sourceUrl: string,
    redirectUrl: string,
    originalHeaders: Record<string, string>,
  ): Record<string, string> | undefined {
    if (!this.#isCrossOrigin(sourceUrl, redirectUrl)) {
      return undefined;
    }

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(originalHeaders)) {
      if (SENSITIVE_REDIRECT_HEADERS.has(name.toLowerCase())) {
        continue;
      }
      if (CROSS_ORIGIN_REDIRECT_HEADERS.has(name.toLowerCase())) {
        headers[name] = value;
      }
    }
    return headers;
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
