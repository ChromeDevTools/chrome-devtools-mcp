import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as Platform from '../platform/platform.js';
import type { NameValue } from './NetworkRequest.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class ServiceWorkerCacheModel extends SDKModel<EventTypes> implements ProtocolProxyApi.StorageDispatcher {
    #private;
    readonly cacheAgent: ProtocolProxyApi.CacheStorageApi;
    /**
     * Invariant: This #model can only be constructed on a ServiceWorker target.
     */
    constructor(target: Target);
    enable(): void;
    clearForStorageKey(storageKey: string): void;
    refreshCacheNames(): void;
    deleteCache(cache: Cache): Promise<void>;
    deleteCacheEntry(cache: Cache, request: string): Promise<void>;
    loadCacheData(cache: Cache, skipCount: number, pageSize: number, pathFilter: string, callback: (arg0: Protocol.CacheStorage.DataEntry[], arg1: number) => void): void;
    loadAllCacheData(cache: Cache, pathFilter: string, callback: (arg0: Protocol.CacheStorage.DataEntry[], arg1: number) => void): void;
    caches(): Cache[];
    dispose(): void;
    private addStorageBucket;
    private removeStorageBucket;
    private loadCacheNames;
    private updateCacheNames;
    private storageBucketAdded;
    private storageBucketRemoved;
    private cacheAdded;
    private cacheRemoved;
    private requestEntries;
    private requestAllEntries;
    cacheStorageListUpdated({ bucketId }: Protocol.Storage.CacheStorageListUpdatedEvent): void;
    cacheStorageContentUpdated({ bucketId, cacheName }: Protocol.Storage.CacheStorageContentUpdatedEvent): void;
    indexedDBListUpdated(_event: Protocol.Storage.IndexedDBListUpdatedEvent): void;
    indexedDBContentUpdated(_event: Protocol.Storage.IndexedDBContentUpdatedEvent): void;
    storageBucketCreatedOrUpdated(_event: Protocol.Storage.StorageBucketCreatedOrUpdatedEvent): void;
    storageBucketDeleted(_event: Protocol.Storage.StorageBucketDeletedEvent): void;
    privateVerificationTokensUpdated(): void;
    setThrottlerSchedulesAsSoonAsPossibleForTest(): void;
}
export declare const enum Events {
    CACHE_ADDED = "CacheAdded",
    CACHE_REMOVED = "CacheRemoved",
    CACHE_STORAGE_CONTENT_UPDATED = "CacheStorageContentUpdated"
}
export interface CacheEvent {
    model: ServiceWorkerCacheModel;
    cache: Cache;
}
export interface CacheStorageContentUpdatedEvent {
    storageBucket: Protocol.Storage.StorageBucket;
    cacheName: string;
}
export interface EventTypes {
    [Events.CACHE_ADDED]: CacheEvent;
    [Events.CACHE_REMOVED]: CacheEvent;
    [Events.CACHE_STORAGE_CONTENT_UPDATED]: CacheStorageContentUpdatedEvent;
}
export declare class Cache {
    #private;
    storageKey: string;
    storageBucket: Protocol.Storage.StorageBucket;
    cacheName: string;
    cacheId: Protocol.CacheStorage.CacheId;
    constructor(model: ServiceWorkerCacheModel, storageBucket: Protocol.Storage.StorageBucket, cacheName: string, cacheId: Protocol.CacheStorage.CacheId);
    inBucket(storageBucket: Protocol.Storage.StorageBucket): boolean;
    equals(cache: Cache): boolean;
    toString(): string;
    requestCachedResponse(url: Platform.DevToolsPath.UrlString, requestHeaders: NameValue[]): Promise<Protocol.CacheStorage.CachedResponse | null>;
}
