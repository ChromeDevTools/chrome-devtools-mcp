// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../platform/platform.js';
/** A thin wrapper around the Cache API to store source map JSONs keyed on Debug IDs */
export class SourceMapCache {
    static create() {
        if (!Platform.HostRuntime.HOST_RUNTIME.getCacheStorage()) {
            return IN_MEMORY_INSTANCE; // TS doesn't like that our in-memory class doesn't have the same private fields.
        }
        return new SourceMapCache('devtools-source-map-cache');
    }
    static createForTest(name) {
        return new SourceMapCache(name);
    }
    #name;
    #cachePromise;
    constructor(name) {
        this.#name = name;
    }
    async set(debugId, scriptOrigin, loaderOrigin, sourceMap) {
        if (scriptOrigin.isOpaque() || loaderOrigin.isOpaque()) {
            return;
        }
        const cache = await this.#cache();
        await cache?.put(SourceMapCache.#urlForDebugId(debugId, scriptOrigin, loaderOrigin), new Response(JSON.stringify(sourceMap)));
    }
    async get(debugId, scriptOrigin, loaderOrigin) {
        if (scriptOrigin.isOpaque() || loaderOrigin.isOpaque()) {
            return null;
        }
        const cache = await this.#cache();
        const response = await cache?.match(SourceMapCache.#urlForDebugId(debugId, scriptOrigin, loaderOrigin));
        return await response?.json() ?? null;
    }
    async #cache() {
        if (this.#cachePromise) {
            return await this.#cachePromise;
        }
        const cacheStorage = Platform.HostRuntime.HOST_RUNTIME.getCacheStorage();
        if (!cacheStorage) {
            return undefined;
        }
        this.#cachePromise = cacheStorage.open(this.#name);
        return await this.#cachePromise;
    }
    /** The Cache API only allows URL as keys, so we construct a simple one. Given that we have our own cache, we have no risk of conflicting URLs */
    static #urlForDebugId(debugId, scriptOrigin, loaderOrigin) {
        return `http://debug.id/${encodeURIComponent(debugId)}?origin=${encodeURIComponent(scriptOrigin.siteId())}&loader=${encodeURIComponent(loaderOrigin.siteId())}`;
    }
    async disposeForTest() {
        await Platform.HostRuntime.HOST_RUNTIME.getCacheStorage()?.delete(this.#name);
    }
}
const IN_MEMORY_INSTANCE = new (class {
    #cache = new Map();
    async set(debugId, scriptOrigin, loaderOrigin, sourceMap) {
        if (scriptOrigin.isOpaque() || loaderOrigin.isOpaque()) {
            return;
        }
        this.#cache.set(`${debugId}|${scriptOrigin.siteId()}|${loaderOrigin.siteId()}`, sourceMap);
    }
    async get(debugId, scriptOrigin, loaderOrigin) {
        if (scriptOrigin.isOpaque() || loaderOrigin.isOpaque()) {
            return null;
        }
        return this.#cache.get(`${debugId}|${scriptOrigin.siteId()}|${loaderOrigin.siteId()}`) ?? null;
    }
    async disposeForTest() {
        this.#cache.clear();
    }
})();
//# sourceMappingURL=SourceMapCache.js.map