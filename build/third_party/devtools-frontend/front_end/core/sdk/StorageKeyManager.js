// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import { SDKModel } from './SDKModel.js';
export class StorageKeyManager extends SDKModel {
    #mainStorageKey;
    #storageKeys;
    constructor(target) {
        super(target);
        this.#mainStorageKey = '';
        this.#storageKeys = new Set();
    }
    updateStorageKeys(storageKeys) {
        const oldStorageKeys = this.#storageKeys;
        this.#storageKeys = storageKeys;
        for (const storageKey of oldStorageKeys) {
            if (!this.#storageKeys.has(storageKey)) {
                this.dispatchEventToListeners("StorageKeyRemoved" /* Events.STORAGE_KEY_REMOVED */, storageKey);
            }
        }
        for (const storageKey of this.#storageKeys) {
            if (!oldStorageKeys.has(storageKey)) {
                this.dispatchEventToListeners("StorageKeyAdded" /* Events.STORAGE_KEY_ADDED */, storageKey);
            }
        }
    }
    storageKeys() {
        return [...this.#storageKeys];
    }
    mainStorageKey() {
        return this.#mainStorageKey;
    }
    setMainStorageKey(storageKey) {
        this.#mainStorageKey = storageKey;
        this.dispatchEventToListeners("MainStorageKeyChanged" /* Events.MAIN_STORAGE_KEY_CHANGED */, {
            mainStorageKey: this.#mainStorageKey,
        });
    }
}
export function parseStorageKey(storageKeyString) {
    // Based on the canonical implementation of StorageKey::Deserialize in
    // third_party/blink/common/storage_key/storage_key.cc
    const components = storageKeyString.split('^');
    const origin = Common.ParsedURL.ParsedURL.extractOrigin(components[0]);
    const storageKey = {
        // For file:// URLs, extracting the origin collapses it to "file://".
        // Node.js uses the full file URL as the StorageKey, so keep the original URL here.
        origin: origin === 'file://' ? components[0] : origin,
        components: new Map(),
    };
    for (let i = 1; i < components.length; ++i) {
        storageKey.components.set(components[i].charAt(0), components[i].substring(1));
    }
    return storageKey;
}
export var StorageKeyComponent;
(function (StorageKeyComponent) {
    StorageKeyComponent["TOP_LEVEL_SITE"] = "0";
    StorageKeyComponent["NONCE_HIGH"] = "1";
    StorageKeyComponent["NONCE_LOW"] = "2";
    StorageKeyComponent["ANCESTOR_CHAIN_BIT"] = "3";
    StorageKeyComponent["TOP_LEVEL_SITE_OPAQUE_NONCE_HIGH"] = "4";
    StorageKeyComponent["TOP_LEVEL_SITE_OPAQUE_NONCE_LOW"] = "5";
    StorageKeyComponent["TOP_LEVEL_SITE_OPAQUE_NONCE_PRECURSOR"] = "6";
})(StorageKeyComponent || (StorageKeyComponent = {}));
export var Events;
(function (Events) {
    Events["STORAGE_KEY_ADDED"] = "StorageKeyAdded";
    Events["STORAGE_KEY_REMOVED"] = "StorageKeyRemoved";
    Events["MAIN_STORAGE_KEY_CHANGED"] = "MainStorageKeyChanged";
})(Events || (Events = {}));
// TODO(jarhar): this is the one of the two usages of Capability.None. Do something about it!
SDKModel.register(StorageKeyManager, { capabilities: 0 /* Capability.NONE */, autostart: false });
//# sourceMappingURL=StorageKeyManager.js.map