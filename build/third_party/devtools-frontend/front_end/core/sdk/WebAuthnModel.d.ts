import type * as Protocol from '../../generated/protocol.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare const enum Events {
    CREDENTIAL_ADDED = "CredentialAdded",
    CREDENTIAL_ASSERTED = "CredentialAsserted",
    CREDENTIAL_DELETED = "CredentialDeleted",
    CREDENTIAL_UPDATED = "CredentialUpdated"
}
export interface EventTypes {
    [Events.CREDENTIAL_ADDED]: Protocol.WebAuthn.CredentialAddedEvent;
    [Events.CREDENTIAL_ASSERTED]: Protocol.WebAuthn.CredentialAssertedEvent;
    [Events.CREDENTIAL_DELETED]: Protocol.WebAuthn.CredentialDeletedEvent;
    [Events.CREDENTIAL_UPDATED]: Protocol.WebAuthn.CredentialUpdatedEvent;
}
export declare class WebAuthnModel extends SDKModel<EventTypes> {
    #private;
    constructor(target: Target);
    setVirtualAuthEnvEnabled(enable: boolean, enableUI?: boolean): Promise<Object>;
    addAuthenticator(options: Protocol.WebAuthn.VirtualAuthenticatorOptions): Promise<Protocol.WebAuthn.AuthenticatorId>;
    removeAuthenticator(authenticatorId: Protocol.WebAuthn.AuthenticatorId): Promise<void>;
    setAutomaticPresenceSimulation(authenticatorId: Protocol.WebAuthn.AuthenticatorId, enabled: boolean): Promise<void>;
    setUserVerified(authenticatorId: Protocol.WebAuthn.AuthenticatorId, isUserVerified: boolean): Promise<void>;
    addCredential(authenticatorId: Protocol.WebAuthn.AuthenticatorId, credential: Protocol.WebAuthn.Credential): Promise<void>;
    getCredentials(authenticatorId: Protocol.WebAuthn.AuthenticatorId): Promise<Protocol.WebAuthn.Credential[]>;
    removeCredential(authenticatorId: Protocol.WebAuthn.AuthenticatorId, credentialId: string): Promise<void>;
    credentialAdded(params: Protocol.WebAuthn.CredentialAddedEvent): void;
    credentialAsserted(params: Protocol.WebAuthn.CredentialAssertedEvent): void;
    credentialDeleted(params: Protocol.WebAuthn.CredentialDeletedEvent): void;
    credentialUpdated(params: Protocol.WebAuthn.CredentialUpdatedEvent): void;
}
