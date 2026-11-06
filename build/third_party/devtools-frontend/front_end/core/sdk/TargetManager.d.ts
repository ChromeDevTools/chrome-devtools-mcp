import type * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import type * as ProtocolClient from '../protocol_client/protocol_client.js';
import * as Root from '../root/root.js';
import { FrameManager } from './FrameManager.js';
import { MultitargetNetworkManager } from './NetworkManager.js';
import { PageResourceLoader } from './PageResourceLoader.js';
import { SDKModel, type SDKModelConstructor } from './SDKModel.js';
import { Target, Type as TargetType } from './Target.js';
export declare class TargetManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    /**
     * @deprecated
     *
     * Intended for {@link SDKModel} classes to be able to retrieve scoped singletons like
     * the "PageResourceLoader" or the "FrameManager".
     *
     * This is only an intermediate step to migrate towards our "layering vision" where
     * SDKModels don't require things from the next layer.
     */
    readonly context: Root.DevToolsContext.DevToolsContext;
    get settings(): Common.Settings.Settings;
    getConsole(): Common.Console.Console;
    getFrameManager(): FrameManager;
    getNetworkManager(): MultitargetNetworkManager;
    getPageResourceLoader(): PageResourceLoader;
    /**
     * @param overrideAutoStartModels If provided, then the `autostart` flag on {@link RegistrationInfo} will be ignored.
     */
    constructor(context: Root.DevToolsContext.DevToolsContext, overrideAutoStartModels?: Set<SDKModelConstructor>);
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): TargetManager;
    static removeInstance(): void;
    dispose(): void;
    onInspectedURLChange(target: Target): void;
    onNameChange(target: Target): void;
    suspendAllTargets(reason?: string): Promise<void>;
    resumeAllTargets(): Promise<void>;
    allTargetsSuspended(): boolean;
    models<T extends SDKModel>(modelClass: SDKModelConstructor<T>, opts?: {
        scoped: boolean;
    }): T[];
    inspectedURL(): string;
    observeModels<T extends SDKModel>(modelClass: SDKModelConstructor<T>, observer: SDKModelObserver<T>, opts?: {
        scoped: boolean;
    }): void;
    unobserveModels<T extends SDKModel>(modelClass: SDKModelConstructor<T>, observer: SDKModelObserver<T>): void;
    modelAdded(modelClass: SDKModelConstructor, model: SDKModel, inScope: boolean): void;
    private modelRemoved;
    addModelListener<Events, T extends keyof Events>(modelClass: SDKModelConstructor<SDKModel<Events>>, eventType: T, listener: Common.EventTarget.EventListener<Events, T>, thisObject?: Object, opts?: {
        scoped: boolean;
    }): void;
    removeModelListener<Events, T extends keyof Events>(modelClass: SDKModelConstructor<SDKModel<Events>>, eventType: T, listener: Common.EventTarget.EventListener<Events, T>, thisObject?: Object): void;
    observeTargets(targetObserver: Observer, opts?: {
        scoped: boolean;
    }): void;
    unobserveTargets(targetObserver: Observer): void;
    createTarget(id: Protocol.Target.TargetID | 'main', name: string, type: TargetType, parentTarget: Target | null, sessionId?: string, waitForDebuggerInPage?: boolean, connection?: ProtocolClient.CDPConnection.CDPConnection, targetInfo?: Protocol.Target.TargetInfo): Target;
    removeTarget(target: Target): void;
    targets(): Target[];
    targetById(id: string): Target | null;
    rootTarget(): Target | null;
    primaryPageTarget(): Target | null;
    browserTarget(): Target | null;
    maybeAttachInitialTarget(): Promise<boolean>;
    clearAllTargetsForTest(): void;
    isInScope(arg: SDKModel | Target | Common.EventTarget.EventTargetEvent<any, any> | null): boolean;
    setScopeTarget(scopeTarget: Target | null): void;
    addScopeChangeListener(listener: () => void): void;
    scopeTarget(): Target | null;
}
export declare const enum Events {
    AVAILABLE_TARGETS_CHANGED = "AvailableTargetsChanged",
    INSPECTED_URL_CHANGED = "InspectedURLChanged",
    NAME_CHANGED = "NameChanged",
    SUSPEND_STATE_CHANGED = "SuspendStateChanged"
}
export interface EventTypes {
    [Events.AVAILABLE_TARGETS_CHANGED]: Protocol.Target.TargetInfo[];
    [Events.INSPECTED_URL_CHANGED]: Target;
    [Events.NAME_CHANGED]: Target;
    [Events.SUSPEND_STATE_CHANGED]: void;
}
export declare class Observer {
    targetAdded(_target: Target): void;
    targetRemoved(_target: Target): void;
}
export declare class SDKModelObserver<T> {
    modelAdded(_model: T): void;
    modelRemoved(_model: T): void;
}
