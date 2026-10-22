// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { SDKModel } from './SDKModel.js';
import { StorageKeyManager } from './StorageKeyManager.js';
export class StorageBucketsModel extends SDKModel {
    enabled = false;
    storageAgent;
    storageKeyManager;
    bucketsById = new Map();
    trackedStorageKeys = new Set();
    constructor(target) {
        super(target);
        target.registerStorageDispatcher(this);
        this.storageAgent = target.storageAgent();
        this.storageKeyManager = target.model(StorageKeyManager);
    }
    getBuckets() {
        return new Set(this.bucketsById.values());
    }
    getBucketsForStorageKey(storageKey) {
        const buckets = [...this.bucketsById.values()];
        return new Set(buckets.filter(({ bucket }) => bucket.storageKey === storageKey));
    }
    getDefaultBucketForStorageKey(storageKey) {
        const buckets = [...this.bucketsById.values()];
        return buckets.find(({ bucket }) => bucket.storageKey === storageKey && bucket.name === undefined) ?? null;
    }
    getBucketById(bucketId) {
        return this.bucketsById.get(bucketId) ?? null;
    }
    getBucketByName(storageKey, bucketName) {
        if (!bucketName) {
            return this.getDefaultBucketForStorageKey(storageKey);
        }
        const buckets = [...this.bucketsById.values()];
        return buckets.find(({ bucket }) => bucket.storageKey === storageKey && bucket.name === bucketName) ?? null;
    }
    deleteBucket(bucket) {
        void this.storageAgent.invoke_deleteStorageBucket({ bucket });
    }
    enable() {
        if (this.enabled) {
            return;
        }
        if (this.storageKeyManager) {
            this.storageKeyManager.addEventListener("StorageKeyAdded" /* StorageKeyManagerEvents.STORAGE_KEY_ADDED */, this.storageKeyAdded, this);
            this.storageKeyManager.addEventListener("StorageKeyRemoved" /* StorageKeyManagerEvents.STORAGE_KEY_REMOVED */, this.storageKeyRemoved, this);
            for (const storageKey of this.storageKeyManager.storageKeys()) {
                this.addStorageKey(storageKey);
            }
        }
        this.enabled = true;
    }
    storageKeyAdded(event) {
        this.addStorageKey(event.data);
    }
    storageKeyRemoved(event) {
        this.removeStorageKey(event.data);
    }
    addStorageKey(storageKey) {
        if (this.trackedStorageKeys.has(storageKey)) {
            throw new Error('Can\'t call addStorageKey for a storage key if it has already been added.');
        }
        this.trackedStorageKeys.add(storageKey);
        void this.storageAgent.invoke_setStorageBucketTracking({ storageKey, enable: true });
    }
    removeStorageKey(storageKey) {
        if (!this.trackedStorageKeys.has(storageKey)) {
            throw new Error('Can\'t call removeStorageKey for a storage key if it hasn\'t already been added.');
        }
        const bucketsForStorageKey = this.getBucketsForStorageKey(storageKey);
        for (const bucket of bucketsForStorageKey) {
            this.bucketRemoved(bucket);
        }
        this.trackedStorageKeys.delete(storageKey);
        void this.storageAgent.invoke_setStorageBucketTracking({ storageKey, enable: false });
    }
    bucketAdded(bucketInfo) {
        this.bucketsById.set(bucketInfo.id, bucketInfo);
        this.dispatchEventToListeners("BucketAdded" /* Events.BUCKET_ADDED */, { model: this, bucketInfo });
    }
    bucketRemoved(bucketInfo) {
        this.bucketsById.delete(bucketInfo.id);
        this.dispatchEventToListeners("BucketRemoved" /* Events.BUCKET_REMOVED */, { model: this, bucketInfo });
    }
    bucketChanged(bucketInfo) {
        this.dispatchEventToListeners("BucketChanged" /* Events.BUCKET_CHANGED */, { model: this, bucketInfo });
    }
    bucketInfosAreEqual(bucketInfo1, bucketInfo2) {
        return bucketInfo1.bucket.storageKey === bucketInfo2.bucket.storageKey && bucketInfo1.id === bucketInfo2.id &&
            bucketInfo1.bucket.name === bucketInfo2.bucket.name && bucketInfo1.expiration === bucketInfo2.expiration &&
            bucketInfo1.quota === bucketInfo2.quota && bucketInfo1.persistent === bucketInfo2.persistent &&
            bucketInfo1.durability === bucketInfo2.durability;
    }
    storageBucketCreatedOrUpdated({ bucketInfo }) {
        const curBucket = this.getBucketById(bucketInfo.id);
        if (curBucket) {
            if (!this.bucketInfosAreEqual(curBucket, bucketInfo)) {
                this.bucketChanged(bucketInfo);
            }
        }
        else {
            this.bucketAdded(bucketInfo);
        }
    }
    storageBucketDeleted({ bucketId }) {
        const curBucket = this.getBucketById(bucketId);
        if (curBucket) {
            this.bucketRemoved(curBucket);
        }
        else {
            throw new Error(`Received an event that Storage Bucket '${bucketId}' was deleted, but it wasn't in the StorageBucketsModel.`);
        }
    }
    indexedDBListUpdated(_event) {
    }
    indexedDBContentUpdated(_event) {
    }
    cacheStorageListUpdated(_event) {
    }
    cacheStorageContentUpdated(_event) {
    }
    privateVerificationTokensUpdated() {
    }
}
SDKModel.register(StorageBucketsModel, { capabilities: 8192 /* Capability.STORAGE */, autostart: false });
export var Events;
(function (Events) {
    Events["BUCKET_ADDED"] = "BucketAdded";
    Events["BUCKET_REMOVED"] = "BucketRemoved";
    Events["BUCKET_CHANGED"] = "BucketChanged";
})(Events || (Events = {}));
//# sourceMappingURL=StorageBucketsModel.js.map