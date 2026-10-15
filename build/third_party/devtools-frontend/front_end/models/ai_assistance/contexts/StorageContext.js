// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../core/sdk/sdk.js';
import { ConversationContext, } from '../agents/AiAgent.js';
import { CookieItem, DOMStorageItem } from '../StorageItem.js';
export class StorageContext extends ConversationContext {
    jslogContext = 'ai-context-storage';
    #item;
    constructor(item) {
        super();
        this.#item = item;
    }
    /**
     * Returns the security origin of the primary inspected page target.
     *
     * The storage context binds to `primaryTargetOrigin` rather than the specific
     * item origin (`this.#item.origin`). This allows generic storage views
     * (which have an empty origin) and third-party storage items to be inspected
     * within the current page conversation.
     *
     * @returns The security origin of the primary page target.
     */
    getOrigin() {
        return SDK.SecurityOrigin.SecurityOrigin.create(this.#item.primaryTargetOrigin);
    }
    getItem() {
        return this.#item;
    }
    getTitle() {
        if (this.#item instanceof CookieItem) {
            if (this.#item.name) {
                return `cookie: ${this.#item.name}${this.#item.origin ? ` ${this.#item.origin}` : ''}`;
            }
            return `cookies${this.#item.isGenericContext ? '' : `: ${this.#item.origin}`}`;
        }
        if (this.#item instanceof DOMStorageItem) {
            if (this.#item.key) {
                return `entry: ${this.#item.key}${this.#item.origin ? ` ${this.#item.origin}` : ''}`;
            }
            const prefix = this.#item.type === 'localStorage' ? 'local storage' : 'session storage';
            return `${prefix}${this.#item.isGenericContext ? '' : `: ${this.#item.origin}`}`;
        }
        return `Storage: ${this.getOrigin().siteId()}`;
    }
    /**
     * @override
     */
    isLoggingEnabled() {
        if (this.#item instanceof CookieItem && Boolean(this.#item.name)) {
            return false;
        }
        if (this.#item instanceof DOMStorageItem && Boolean(this.#item.key)) {
            return false;
        }
        return true;
    }
    async getSuggestions() {
        if (this.#item instanceof CookieItem) {
            if (this.#item.name) {
                return [
                    {
                        title: 'Why is this cookie set?',
                        jslogContext: 'storage-cookie',
                    },
                    {
                        title: 'Explain the value of this cookie',
                        jslogContext: 'storage-cookie',
                    },
                ];
            }
            return [
                {
                    title: 'Explain the cookies set by this page',
                    jslogContext: 'storage-cookie',
                },
            ];
        }
        if (this.#item instanceof DOMStorageItem) {
            if (this.#item.key) {
                return [
                    {
                        title: 'What is the purpose of this storage entry?',
                        jslogContext: 'storage-domstorage',
                    },
                    {
                        title: 'Explain the value of this storage entry',
                        jslogContext: 'storage-domstorage',
                    },
                ];
            }
            return [
                {
                    title: 'Explain these storage items',
                    jslogContext: 'storage-domstorage',
                },
            ];
        }
        return undefined;
    }
}
//# sourceMappingURL=StorageContext.js.map