// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { SDKModel } from './SDKModel.js';
export class PrivateVerificationTokensModel extends SDKModel {
    #storageAgent;
    constructor(target) {
        super(target);
        target.registerStorageDispatcher(this);
        this.#storageAgent = target.storageAgent();
    }
    setTracking(enable) {
        void this.#storageAgent.invoke_setPrivateVerificationTokensTracking({ enable });
    }
    async getTokens() {
        const response = await this.#storageAgent.invoke_getPrivateVerificationTokens();
        if (response.getError()) {
            return [];
        }
        return response.tokens ?? [];
    }
    async getIssuerConfigs() {
        const response = await this.#storageAgent.invoke_getPrivateVerificationTokensIssuerConfigs();
        if (response.getError()) {
            return [];
        }
        return response.configs ?? [];
    }
    async clearTokens(issuerOrigin) {
        await this.#storageAgent.invoke_clearPrivateVerificationTokens({ issuerOrigin });
    }
    async deleteToken(tokenId) {
        await this.#storageAgent.invoke_deletePrivateVerificationToken({ tokenId });
    }
    privateVerificationTokensUpdated() {
        this.dispatchEventToListeners("TokensUpdated" /* Events.TOKENS_UPDATED */);
    }
    cacheStorageContentUpdated(_event) {
    }
    cacheStorageListUpdated(_event) {
    }
    indexedDBContentUpdated(_event) {
    }
    indexedDBListUpdated(_event) {
    }
    storageBucketCreatedOrUpdated(_event) {
    }
    storageBucketDeleted(_event) {
    }
}
SDKModel.register(PrivateVerificationTokensModel, { capabilities: 8192 /* Capability.STORAGE */, autostart: false });
export var Events;
(function (Events) {
    Events["TOKENS_UPDATED"] = "TokensUpdated";
})(Events || (Events = {}));
//# sourceMappingURL=PrivateVerificationTokensModel.js.map