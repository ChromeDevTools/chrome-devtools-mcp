import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class StorageBucketsModel extends SDKModel<EventTypes> implements ProtocolProxyApi.StorageDispatcher {
    private enabled;
    readonly storageAgent: ProtocolProxyApi.StorageApi;
    private readonly storageKeyManager;
    private bucketsById;
    private trackedStorageKeys;
    constructor(target: Target);
    getBuckets(): Set<Protocol.Storage.StorageBucketInfo>;
    getBucketsForStorageKey(storageKey: string): Set<Protocol.Storage.StorageBucketInfo>;
    getDefaultBucketForStorageKey(storageKey: string): Protocol.Storage.StorageBucketInfo | null;
    getBucketById(bucketId: string): Protocol.Storage.StorageBucketInfo | null;
    getBucketByName(storageKey: string, bucketName?: string): Protocol.Storage.StorageBucketInfo | null;
    deleteBucket(bucket: Protocol.Storage.StorageBucket): void;
    enable(): void;
    private storageKeyAdded;
    private storageKeyRemoved;
    private addStorageKey;
    private removeStorageKey;
    private bucketAdded;
    private bucketRemoved;
    private bucketChanged;
    private bucketInfosAreEqual;
    storageBucketCreatedOrUpdated({ bucketInfo }: Protocol.Storage.StorageBucketCreatedOrUpdatedEvent): void;
    storageBucketDeleted({ bucketId }: Protocol.Storage.StorageBucketDeletedEvent): void;
    indexedDBListUpdated(_event: Protocol.Storage.IndexedDBListUpdatedEvent): void;
    indexedDBContentUpdated(_event: Protocol.Storage.IndexedDBContentUpdatedEvent): void;
    cacheStorageListUpdated(_event: Protocol.Storage.CacheStorageListUpdatedEvent): void;
    cacheStorageContentUpdated(_event: Protocol.Storage.CacheStorageContentUpdatedEvent): void;
    privateVerificationTokensUpdated(): void;
}
export declare const enum Events {
    BUCKET_ADDED = "BucketAdded",
    BUCKET_REMOVED = "BucketRemoved",
    BUCKET_CHANGED = "BucketChanged"
}
export interface BucketEvent {
    model: StorageBucketsModel;
    bucketInfo: Protocol.Storage.StorageBucketInfo;
}
export interface EventTypes {
    [Events.BUCKET_ADDED]: BucketEvent;
    [Events.BUCKET_REMOVED]: BucketEvent;
    [Events.BUCKET_CHANGED]: BucketEvent;
}
