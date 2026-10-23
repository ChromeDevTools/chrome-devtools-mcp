import * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import type * as Platform from '../platform/platform.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class ServiceWorkerManager extends SDKModel<EventTypes> {
    #private;
    constructor(target: Target);
    dispose(): void;
    enable(): Promise<void>;
    disable(): Promise<void>;
    registrations(): Map<string, ServiceWorkerRegistration>;
    findVersion(versionId: string): ServiceWorkerVersion | null;
    deleteRegistration(registrationId: string): void;
    updateRegistration(registrationId: string): Promise<void>;
    deliverPushMessage(registrationId: Protocol.ServiceWorker.RegistrationID, data: string): Promise<void>;
    dispatchSyncEvent(registrationId: Protocol.ServiceWorker.RegistrationID, tag: string, lastChance: boolean): Promise<void>;
    dispatchPeriodicSyncEvent(registrationId: Protocol.ServiceWorker.RegistrationID, tag: string): Promise<void>;
    private unregister;
    startWorker(scopeURL: string): Promise<void>;
    skipWaiting(scopeURL: string): Promise<void>;
    stopWorker(versionId: string): Promise<void>;
    workerRegistrationUpdated(registrations: Protocol.ServiceWorker.ServiceWorkerRegistration[]): void;
    workerVersionUpdated(versions: Protocol.ServiceWorker.ServiceWorkerVersion[]): void;
    workerErrorReported(payload: Protocol.ServiceWorker.ServiceWorkerErrorMessage): void;
    private forceUpdateSettingChanged;
}
export declare const enum Events {
    REGISTRATION_UPDATED = "RegistrationUpdated",
    REGISTRATION_ERROR_ADDED = "RegistrationErrorAdded",
    REGISTRATION_DELETED = "RegistrationDeleted"
}
export interface RegistrationErrorAddedEvent {
    registration: ServiceWorkerRegistration;
    error: Protocol.ServiceWorker.ServiceWorkerErrorMessage;
}
export interface EventTypes {
    [Events.REGISTRATION_UPDATED]: ServiceWorkerRegistration;
    [Events.REGISTRATION_ERROR_ADDED]: RegistrationErrorAddedEvent;
    [Events.REGISTRATION_DELETED]: ServiceWorkerRegistration;
}
/**
 * For every version, we keep a history of ServiceWorkerVersionState. Every time
 * a version is updated we will add a new state at the head of the history chain.
 * This history tells us information such as what the current state is, or when
 * the version becomes installed.
 */
export declare class ServiceWorkerVersionState {
    runningStatus: Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus;
    status: Protocol.ServiceWorker.ServiceWorkerVersionStatus;
    lastUpdatedTimestamp: number;
    previousState: ServiceWorkerVersionState | null;
    constructor(runningStatus: Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus, status: Protocol.ServiceWorker.ServiceWorkerVersionStatus, previousState: ServiceWorkerVersionState | null, timestamp: number);
}
export declare class ServiceWorkerRouterRule {
    condition: string;
    source: string;
    id: number;
    constructor(condition: string, source: string, id: number);
}
export declare class ServiceWorkerVersion {
    id: string;
    scriptURL: Platform.DevToolsPath.UrlString;
    parsedURL: Common.ParsedURL.ParsedURL;
    securityOrigin: string;
    scriptLastModified: number | undefined;
    scriptResponseTime: number | undefined;
    controlledClients: Protocol.Target.TargetID[];
    targetId: string | null;
    routerRules: ServiceWorkerRouterRule[] | null;
    currentState: ServiceWorkerVersionState;
    registration: ServiceWorkerRegistration;
    constructor(registration: ServiceWorkerRegistration, payload: Protocol.ServiceWorker.ServiceWorkerVersion);
    update(payload: Protocol.ServiceWorker.ServiceWorkerVersion): void;
    isStartable(): boolean;
    isStoppedAndRedundant(): boolean;
    isStopped(): boolean;
    isStarting(): boolean;
    isRunning(): boolean;
    isStopping(): boolean;
    isNew(): boolean;
    isInstalling(): boolean;
    isInstalled(): boolean;
    isActivating(): boolean;
    isActivated(): boolean;
    isRedundant(): boolean;
    get status(): Protocol.ServiceWorker.ServiceWorkerVersionStatus;
    get runningStatus(): Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus;
    mode(): string;
    private parseJSONRules;
    /**
     * `urlPattern` can be either plain text (e.g. '/foo/*') or a JSON-serialized URLPattern/URLPatternInit object.
     * Parses it to an object if valid JSON, otherwise falls back to the original string.
     */
    private parseURLPatternCondition;
    private parseTypedRules;
}
export declare namespace ServiceWorkerVersion {
    const RunningStatus: Record<Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus, () => Platform.UIString.LocalizedString>;
    const Status: Record<Protocol.ServiceWorker.ServiceWorkerVersionStatus, () => Platform.UIString.LocalizedString>;
    const enum Modes {
        INSTALLING = "installing",
        WAITING = "waiting",
        ACTIVE = "active",
        REDUNDANT = "redundant"
    }
}
export declare class ServiceWorkerRegistration {
    #private;
    id: Protocol.ServiceWorker.RegistrationID;
    scopeURL: Platform.DevToolsPath.UrlString;
    securityOrigin: Platform.DevToolsPath.UrlString;
    isDeleted: boolean;
    versions: Map<string, ServiceWorkerVersion>;
    deleting: boolean;
    errors: Protocol.ServiceWorker.ServiceWorkerErrorMessage[];
    constructor(payload: Protocol.ServiceWorker.ServiceWorkerRegistration);
    update(payload: Protocol.ServiceWorker.ServiceWorkerRegistration): void;
    fingerprint(): symbol;
    versionsByMode(): Map<string, ServiceWorkerVersion>;
    updateVersion(payload: Protocol.ServiceWorker.ServiceWorkerVersion): ServiceWorkerVersion;
    isRedundant(): boolean;
    shouldBeRemoved(): boolean;
    canBeRemoved(): boolean;
}
