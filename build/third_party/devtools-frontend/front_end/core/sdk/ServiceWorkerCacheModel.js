// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import { SDKModel } from './SDKModel.js';
import { StorageBucketsModel } from './StorageBucketsModel.js';
const UIStrings = {
    /**
     * @description Error message when failing to delete a cache entry in ServiceWorkerCacheAgent.
     * @example {https://cache} PH1
     * @example {error message} PH2
     */
    serviceworkercacheagentError: '`ServiceWorkerCacheAgent` error deleting cache entry {PH1} in cache: {PH2}',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/ServiceWorkerCacheModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ServiceWorkerCacheModel extends SDKModel {
    cacheAgent;
    #storageAgent;
    #storageBucketModel;
    #console;
    #caches = new Map();
    #storageKeysTracked = new Set();
    #storageBucketsUpdated = new Set();
    #throttler = new Common.Throttler.Throttler(2000);
    #enabled = false;
    // Used by tests to remove the Throttler timeout.
    #scheduleAsSoonAsPossible = false;
    /**
     * Invariant: This #model can only be constructed on a ServiceWorker target.
     */
    constructor(target) {
        super(target);
        target.registerStorageDispatcher(this);
        this.cacheAgent = target.cacheStorageAgent();
        this.#storageAgent = target.storageAgent();
        this.#storageBucketModel = target.model(StorageBucketsModel);
        this.#console = target.targetManager().getConsole();
    }
    enable() {
        if (this.#enabled) {
            return;
        }
        this.#storageBucketModel.addEventListener("BucketAdded" /* StorageBucketsModelEvents.BUCKET_ADDED */, this.storageBucketAdded, this);
        this.#storageBucketModel.addEventListener("BucketRemoved" /* StorageBucketsModelEvents.BUCKET_REMOVED */, this.storageBucketRemoved, this);
        for (const storageBucket of this.#storageBucketModel.getBuckets()) {
            this.addStorageBucket(storageBucket.bucket);
        }
        this.#enabled = true;
    }
    clearForStorageKey(storageKey) {
        for (const [opaqueId, cache] of this.#caches.entries()) {
            if (cache.storageKey === storageKey) {
                this.#caches.delete((opaqueId));
                this.cacheRemoved((cache));
            }
        }
        for (const storageBucket of this.#storageBucketModel.getBucketsForStorageKey(storageKey)) {
            void this.loadCacheNames(storageBucket.bucket);
        }
    }
    refreshCacheNames() {
        for (const cache of this.#caches.values()) {
            this.cacheRemoved(cache);
        }
        this.#caches.clear();
        const storageBuckets = this.#storageBucketModel.getBuckets();
        for (const storageBucket of storageBuckets) {
            void this.loadCacheNames(storageBucket.bucket);
        }
    }
    async deleteCache(cache) {
        const response = await this.cacheAgent.invoke_deleteCache({ cacheId: cache.cacheId });
        if (response.getError()) {
            console.error(`ServiceWorkerCacheAgent error deleting cache ${cache.toString()}: ${response.getError()}`);
            return;
        }
        this.#caches.delete(cache.cacheId);
        this.cacheRemoved(cache);
    }
    async deleteCacheEntry(cache, request) {
        const response = await this.cacheAgent.invoke_deleteEntry({ cacheId: cache.cacheId, request });
        if (response.getError()) {
            this.#console.error(i18nString(UIStrings.serviceworkercacheagentError, { PH1: cache.toString(), PH2: String(response.getError()) }));
            return;
        }
    }
    loadCacheData(cache, skipCount, pageSize, pathFilter, callback) {
        void this.requestEntries(cache, skipCount, pageSize, pathFilter, callback);
    }
    loadAllCacheData(cache, pathFilter, callback) {
        void this.requestAllEntries(cache, pathFilter, callback);
    }
    caches() {
        return [...this.#caches.values()];
    }
    dispose() {
        for (const cache of this.#caches.values()) {
            this.cacheRemoved(cache);
        }
        this.#caches.clear();
        if (this.#enabled) {
            this.#storageBucketModel.removeEventListener("BucketAdded" /* StorageBucketsModelEvents.BUCKET_ADDED */, this.storageBucketAdded, this);
            this.#storageBucketModel.removeEventListener("BucketRemoved" /* StorageBucketsModelEvents.BUCKET_REMOVED */, this.storageBucketRemoved, this);
        }
    }
    addStorageBucket(storageBucket) {
        void this.loadCacheNames(storageBucket);
        if (!this.#storageKeysTracked.has(storageBucket.storageKey)) {
            this.#storageKeysTracked.add(storageBucket.storageKey);
            void this.#storageAgent.invoke_trackCacheStorageForStorageKey({ storageKey: storageBucket.storageKey });
        }
    }
    removeStorageBucket(storageBucket) {
        let storageKeyCount = 0;
        for (const [opaqueId, cache] of this.#caches.entries()) {
            if (storageBucket.storageKey === cache.storageKey) {
                storageKeyCount++;
            }
            if (cache.inBucket(storageBucket)) {
                storageKeyCount--;
                this.#caches.delete((opaqueId));
                this.cacheRemoved((cache));
            }
        }
        if (storageKeyCount === 0) {
            this.#storageKeysTracked.delete(storageBucket.storageKey);
            void this.#storageAgent.invoke_untrackCacheStorageForStorageKey({ storageKey: storageBucket.storageKey });
        }
    }
    async loadCacheNames(storageBucket) {
        const response = await this.cacheAgent.invoke_requestCacheNames({ storageBucket });
        if (response.getError()) {
            return;
        }
        this.updateCacheNames(storageBucket, response.caches);
    }
    updateCacheNames(storageBucket, cachesJson) {
        function deleteAndSaveOldCaches(cache) {
            if (cache.inBucket(storageBucket) && !updatingCachesIds.has(cache.cacheId)) {
                oldCaches.set(cache.cacheId, cache);
                this.#caches.delete(cache.cacheId);
            }
        }
        const updatingCachesIds = new Set();
        const newCaches = new Map();
        const oldCaches = new Map();
        for (const cacheJson of cachesJson) {
            const storageBucket = cacheJson.storageBucket ??
                this.#storageBucketModel.getDefaultBucketForStorageKey(cacheJson.storageKey)?.bucket;
            if (!storageBucket) {
                continue;
            }
            const cache = new Cache(this, storageBucket, cacheJson.cacheName, cacheJson.cacheId);
            updatingCachesIds.add(cache.cacheId);
            if (this.#caches.has(cache.cacheId)) {
                continue;
            }
            newCaches.set(cache.cacheId, cache);
            this.#caches.set(cache.cacheId, cache);
        }
        this.#caches.forEach(deleteAndSaveOldCaches, this);
        newCaches.forEach(this.cacheAdded, this);
        oldCaches.forEach(this.cacheRemoved, this);
    }
    storageBucketAdded({ data: { bucketInfo: { bucket } } }) {
        this.addStorageBucket(bucket);
    }
    storageBucketRemoved({ data: { bucketInfo: { bucket } } }) {
        this.removeStorageBucket(bucket);
    }
    cacheAdded(cache) {
        this.dispatchEventToListeners("CacheAdded" /* Events.CACHE_ADDED */, { model: this, cache });
    }
    cacheRemoved(cache) {
        this.dispatchEventToListeners("CacheRemoved" /* Events.CACHE_REMOVED */, { model: this, cache });
    }
    async requestEntries(cache, skipCount, pageSize, pathFilter, callback) {
        const response = await this.cacheAgent.invoke_requestEntries({ cacheId: cache.cacheId, skipCount, pageSize, pathFilter });
        if (response.getError()) {
            console.error('ServiceWorkerCacheAgent error while requesting entries: ', response.getError());
            return;
        }
        callback(response.cacheDataEntries, response.returnCount);
    }
    async requestAllEntries(cache, pathFilter, callback) {
        const response = await this.cacheAgent.invoke_requestEntries({ cacheId: cache.cacheId, pathFilter });
        if (response.getError()) {
            console.error('ServiceWorkerCacheAgent error while requesting entries: ', response.getError());
            return;
        }
        callback(response.cacheDataEntries, response.returnCount);
    }
    cacheStorageListUpdated({ bucketId }) {
        const storageBucket = this.#storageBucketModel.getBucketById(bucketId)?.bucket;
        if (storageBucket) {
            this.#storageBucketsUpdated.add(storageBucket);
            void this.#throttler.schedule(() => {
                const promises = Array.from(this.#storageBucketsUpdated, storageBucket => this.loadCacheNames(storageBucket));
                this.#storageBucketsUpdated.clear();
                return Promise.all(promises);
            }, this.#scheduleAsSoonAsPossible ? "AsSoonAsPossible" /* Common.Throttler.Scheduling.AS_SOON_AS_POSSIBLE */ : "Default" /* Common.Throttler.Scheduling.DEFAULT */);
        }
    }
    cacheStorageContentUpdated({ bucketId, cacheName }) {
        const storageBucket = this.#storageBucketModel.getBucketById(bucketId)?.bucket;
        if (storageBucket) {
            this.dispatchEventToListeners("CacheStorageContentUpdated" /* Events.CACHE_STORAGE_CONTENT_UPDATED */, { storageBucket, cacheName });
        }
    }
    indexedDBListUpdated(_event) {
    }
    indexedDBContentUpdated(_event) {
    }
    storageBucketCreatedOrUpdated(_event) {
    }
    storageBucketDeleted(_event) {
    }
    privateVerificationTokensUpdated() {
    }
    setThrottlerSchedulesAsSoonAsPossibleForTest() {
        this.#scheduleAsSoonAsPossible = true;
    }
}
export var Events;
(function (Events) {
    Events["CACHE_ADDED"] = "CacheAdded";
    Events["CACHE_REMOVED"] = "CacheRemoved";
    Events["CACHE_STORAGE_CONTENT_UPDATED"] = "CacheStorageContentUpdated";
})(Events || (Events = {}));
export class Cache {
    #model;
    storageKey;
    storageBucket;
    cacheName;
    cacheId;
    constructor(model, storageBucket, cacheName, cacheId) {
        this.#model = model;
        this.storageBucket = storageBucket;
        this.storageKey = storageBucket.storageKey;
        this.cacheName = cacheName;
        this.cacheId = cacheId;
    }
    inBucket(storageBucket) {
        return this.storageKey === storageBucket.storageKey && this.storageBucket.name === storageBucket.name;
    }
    equals(cache) {
        return this.cacheId === cache.cacheId;
    }
    toString() {
        return this.storageKey + this.cacheName;
    }
    async requestCachedResponse(url, requestHeaders) {
        const response = await this.#model.cacheAgent.invoke_requestCachedResponse({ cacheId: this.cacheId, requestURL: url, requestHeaders });
        if (response.getError()) {
            return null;
        }
        return response.response;
    }
}
SDKModel.register(ServiceWorkerCacheModel, { capabilities: 8192 /* Capability.STORAGE */, autostart: false });
//# sourceMappingURL=ServiceWorkerCacheModel.js.map