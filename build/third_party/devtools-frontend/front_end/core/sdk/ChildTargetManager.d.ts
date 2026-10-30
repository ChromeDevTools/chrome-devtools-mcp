import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class ChildTargetManager extends SDKModel<EventTypes> implements ProtocolProxyApi.TargetDispatcher {
    #private;
    constructor(parentTarget: Target);
    static install(attachCallback?: ((arg0: {
        target: Target;
        waitingForDebugger: boolean;
    }) => Promise<void>)): void;
    childTargets(): Target[];
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    dispose(): void;
    targetCreated({ targetInfo }: Protocol.Target.TargetCreatedEvent): void;
    targetInfoChanged({ targetInfo }: Protocol.Target.TargetInfoChangedEvent): void;
    targetDestroyed({ targetId }: Protocol.Target.TargetDestroyedEvent): void;
    targetCrashed({ targetId }: Protocol.Target.TargetCrashedEvent): void;
    private fireAvailableTargetsChanged;
    getParentTargetId(): Promise<Protocol.Target.TargetID>;
    getTargetInfo(): Promise<Protocol.Target.TargetInfo>;
    attachedToTarget({ sessionId, targetInfo, waitingForDebugger }: Protocol.Target.AttachedToTargetEvent): Promise<void>;
    private initializeStorage;
    detachedFromTarget({ sessionId }: Protocol.Target.DetachedFromTargetEvent): void;
    receivedMessageFromTarget({}: Protocol.Target.ReceivedMessageFromTargetEvent): void;
    targetInfos(): Protocol.Target.TargetInfo[];
    private static lastAnonymousTargetId;
    private static attachCallback?;
}
export declare const enum Events {
    TARGET_CREATED = "TargetCreated",
    TARGET_DESTROYED = "TargetDestroyed",
    TARGET_INFO_CHANGED = "TargetInfoChanged"
}
export interface EventTypes {
    [Events.TARGET_CREATED]: Protocol.Target.TargetInfo;
    [Events.TARGET_DESTROYED]: Protocol.Target.TargetID;
    [Events.TARGET_INFO_CHANGED]: Protocol.Target.TargetInfo;
}
