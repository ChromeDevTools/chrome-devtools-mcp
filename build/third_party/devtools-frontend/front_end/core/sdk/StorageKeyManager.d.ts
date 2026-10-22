import type * as Platform from '../platform/platform.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class StorageKeyManager extends SDKModel<EventTypes> {
    #private;
    constructor(target: Target);
    updateStorageKeys(storageKeys: Set<string>): void;
    storageKeys(): string[];
    mainStorageKey(): string;
    setMainStorageKey(storageKey: string): void;
}
export declare function parseStorageKey(storageKeyString: string): StorageKey;
export declare const enum StorageKeyComponent {
    TOP_LEVEL_SITE = "0",
    NONCE_HIGH = "1",
    NONCE_LOW = "2",
    ANCESTOR_CHAIN_BIT = "3",
    TOP_LEVEL_SITE_OPAQUE_NONCE_HIGH = "4",
    TOP_LEVEL_SITE_OPAQUE_NONCE_LOW = "5",
    TOP_LEVEL_SITE_OPAQUE_NONCE_PRECURSOR = "6"
}
export interface StorageKey {
    origin: Platform.DevToolsPath.UrlString;
    components: Map<StorageKeyComponent, string>;
}
export declare const enum Events {
    STORAGE_KEY_ADDED = "StorageKeyAdded",
    STORAGE_KEY_REMOVED = "StorageKeyRemoved",
    MAIN_STORAGE_KEY_CHANGED = "MainStorageKeyChanged"
}
export interface MainStorageKeyChangedEvent {
    mainStorageKey: string;
}
export interface EventTypes {
    [Events.STORAGE_KEY_ADDED]: string;
    [Events.STORAGE_KEY_REMOVED]: string;
    [Events.MAIN_STORAGE_KEY_CHANGED]: MainStorageKeyChangedEvent;
}
