import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class DOMStorage extends Common.ObjectWrapper.ObjectWrapper<DOMStorage.EventTypes> {
    #private;
    private readonly model;
    constructor(model: DOMStorageModel, storageKey: string, isLocalStorage: boolean);
    static storageId(storageKey: string, isLocalStorage: boolean): Protocol.DOMStorage.StorageId;
    get id(): Protocol.DOMStorage.StorageId;
    get storageKey(): string;
    get isLocalStorage(): boolean;
    getItems(): Promise<Protocol.DOMStorage.Item[] | null>;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
}
export declare namespace DOMStorage {
    const enum Events {
        DOM_STORAGE_ITEMS_CLEARED = "DOMStorageItemsCleared",
        DOM_STORAGE_ITEM_REMOVED = "DOMStorageItemRemoved",
        DOM_STORAGE_ITEM_ADDED = "DOMStorageItemAdded",
        DOM_STORAGE_ITEM_UPDATED = "DOMStorageItemUpdated"
    }
    interface DOMStorageItemRemovedEvent {
        key: string;
    }
    interface DOMStorageItemAddedEvent {
        key: string;
        value: string;
    }
    interface DOMStorageItemUpdatedEvent {
        key: string;
        oldValue: string;
        value: string;
    }
    interface EventTypes {
        [Events.DOM_STORAGE_ITEMS_CLEARED]: void;
        [Events.DOM_STORAGE_ITEM_REMOVED]: DOMStorageItemRemovedEvent;
        [Events.DOM_STORAGE_ITEM_ADDED]: DOMStorageItemAddedEvent;
        [Events.DOM_STORAGE_ITEM_UPDATED]: DOMStorageItemUpdatedEvent;
    }
}
export declare class DOMStorageModel extends SDKModel<EventTypes> {
    #private;
    readonly agent: ProtocolProxyApi.DOMStorageApi;
    private enabled?;
    constructor(target: Target);
    enable(): void;
    clearForStorageKey(storageKey: string): void;
    private storageKeyAdded;
    private addStorageKey;
    private storageKeyRemoved;
    private removeStorageKey;
    private storageKey;
    domStorageItemsCleared(storageId: Protocol.DOMStorage.StorageId): void;
    domStorageItemRemoved(storageId: Protocol.DOMStorage.StorageId, key: string): void;
    domStorageItemAdded(storageId: Protocol.DOMStorage.StorageId, key: string, value: string): void;
    domStorageItemUpdated(storageId: Protocol.DOMStorage.StorageId, key: string, oldValue: string, value: string): void;
    storageForId(storageId: Protocol.DOMStorage.StorageId): DOMStorage;
    storages(): DOMStorage[];
}
export declare const enum Events {
    DOM_STORAGE_ADDED = "DOMStorageAdded",
    DOM_STORAGE_REMOVED = "DOMStorageRemoved"
}
export interface EventTypes {
    [Events.DOM_STORAGE_ADDED]: DOMStorage;
    [Events.DOM_STORAGE_REMOVED]: DOMStorage;
}
export declare class DOMStorageDispatcher implements ProtocolProxyApi.DOMStorageDispatcher {
    private readonly model;
    constructor(model: DOMStorageModel);
    domStorageItemsCleared({ storageId }: Protocol.DOMStorage.DomStorageItemsClearedEvent): void;
    domStorageItemRemoved({ storageId, key }: Protocol.DOMStorage.DomStorageItemRemovedEvent): void;
    domStorageItemAdded({ storageId, key, newValue }: Protocol.DOMStorage.DomStorageItemAddedEvent): void;
    domStorageItemUpdated({ storageId, key, oldValue, newValue }: Protocol.DOMStorage.DomStorageItemUpdatedEvent): void;
}
