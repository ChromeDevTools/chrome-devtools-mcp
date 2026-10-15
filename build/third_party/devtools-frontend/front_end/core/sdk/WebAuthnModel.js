// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { SDKModel } from './SDKModel.js';
export class WebAuthnModel extends SDKModel {
    #agent;
    constructor(target) {
        super(target);
        this.#agent = target.webAuthnAgent();
        target.registerWebAuthnDispatcher(new WebAuthnDispatcher(this));
    }
    setVirtualAuthEnvEnabled(enable) {
        if (enable) {
            return this.#agent.invoke_enable({ enableUI: true });
        }
        return this.#agent.invoke_disable();
    }
    async addAuthenticator(options) {
        const response = await this.#agent.invoke_addVirtualAuthenticator({ options });
        return response.authenticatorId;
    }
    async removeAuthenticator(authenticatorId) {
        await this.#agent.invoke_removeVirtualAuthenticator({ authenticatorId });
    }
    async setAutomaticPresenceSimulation(authenticatorId, enabled) {
        await this.#agent.invoke_setAutomaticPresenceSimulation({ authenticatorId, enabled });
    }
    async getCredentials(authenticatorId) {
        const response = await this.#agent.invoke_getCredentials({ authenticatorId });
        return response.credentials;
    }
    async removeCredential(authenticatorId, credentialId) {
        await this.#agent.invoke_removeCredential({ authenticatorId, credentialId });
    }
    credentialAdded(params) {
        this.dispatchEventToListeners("CredentialAdded" /* Events.CREDENTIAL_ADDED */, params);
    }
    credentialAsserted(params) {
        this.dispatchEventToListeners("CredentialAsserted" /* Events.CREDENTIAL_ASSERTED */, params);
    }
    credentialDeleted(params) {
        this.dispatchEventToListeners("CredentialDeleted" /* Events.CREDENTIAL_DELETED */, params);
    }
    credentialUpdated(params) {
        this.dispatchEventToListeners("CredentialUpdated" /* Events.CREDENTIAL_UPDATED */, params);
    }
}
class WebAuthnDispatcher {
    #model;
    constructor(model) {
        this.#model = model;
    }
    credentialAdded(params) {
        this.#model.credentialAdded(params);
    }
    credentialAsserted(params) {
        this.#model.credentialAsserted(params);
    }
    credentialDeleted(params) {
        this.#model.credentialDeleted(params);
    }
    credentialUpdated(params) {
        this.#model.credentialUpdated(params);
    }
}
SDKModel.register(WebAuthnModel, { capabilities: 65536 /* Capability.WEB_AUTHN */, autostart: false });
//# sourceMappingURL=WebAuthnModel.js.map