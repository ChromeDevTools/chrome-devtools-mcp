// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const EMPTY_ORIGIN = '';
export class StorageItem {
    primaryTargetOrigin;
    origin;
    constructor(
    /**
     * The origin of the top-level primary page target being inspected.
     * Used to restrict AI agent tools from accessing unauthorized pages.
     */
    primaryTargetOrigin, 
    /**
     * The origin of the selected storage or cookie item.
     * If empty (''), this represents a generic category-level context (e.g., all Local Storage or all Cookies).
     */
    origin = EMPTY_ORIGIN) {
        this.primaryTargetOrigin = primaryTargetOrigin;
        this.origin = origin;
    }
    get isGenericContext() {
        return this.origin === EMPTY_ORIGIN;
    }
    static createGenericContext(primaryTargetOrigin, ..._args) {
        return new StorageItem(primaryTargetOrigin, EMPTY_ORIGIN);
    }
}
export class DOMStorageItem extends StorageItem {
    storageKey;
    type;
    key;
    constructor(primaryTargetOrigin, origin, 
    /** The storage key partition identifier used by the browser storage engine. */
    storageKey, 
    /** The sub-category of DOM storage: 'localStorage' or 'sessionStorage'. */
    type, 
    /** The optional specific key of the selected item in this storage partition. */
    key) {
        super(primaryTargetOrigin, origin);
        this.storageKey = storageKey;
        this.type = type;
        this.key = key;
    }
    static createGenericContext(primaryTargetOrigin, type) {
        return new DOMStorageItem(primaryTargetOrigin, EMPTY_ORIGIN, undefined, type);
    }
}
export class CookieItem extends StorageItem {
    name;
    constructor(primaryTargetOrigin, origin, name) {
        super(primaryTargetOrigin, origin);
        this.name = name;
    }
    static createGenericContext(primaryTargetOrigin) {
        return new CookieItem(primaryTargetOrigin, EMPTY_ORIGIN);
    }
}
//# sourceMappingURL=StorageItem.js.map