import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import * as Platform from '../platform/platform.js';
import { CategorizedBreakpoint, Category } from './CategorizedBreakpoint.js';
import type { EventListenerPausedDetailsAuxData, Location } from './DebuggerModel.js';
import { type DOMNode } from './DOMModel.js';
import { RemoteObject } from './RemoteObject.js';
import { RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
import { type SDKModelObserver, TargetManager } from './TargetManager.js';
export declare class DOMDebuggerModel extends SDKModel<EventTypes> {
    #private;
    readonly agent: ProtocolProxyApi.DOMDebuggerApi;
    suspended: boolean;
    constructor(target: Target);
    runtimeModel(): RuntimeModel;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    eventListeners(remoteObject: RemoteObject): Promise<EventListener[]>;
    retrieveDOMBreakpoints(): void;
    domBreakpoints(): DOMBreakpoint[];
    hasDOMBreakpoint(node: DOMNode, type: Protocol.DOMDebugger.DOMBreakpointType): boolean;
    setDOMBreakpoint(node: DOMNode, type: Protocol.DOMDebugger.DOMBreakpointType): DOMBreakpoint;
    removeDOMBreakpoint(node: DOMNode, type: Protocol.DOMDebugger.DOMBreakpointType): void;
    removeAllDOMBreakpoints(): void;
    toggleDOMBreakpoint(breakpoint: DOMBreakpoint, enabled: boolean): void;
    private enableDOMBreakpoint;
    private disableDOMBreakpoint;
    private nodeHasBreakpoints;
    resolveDOMBreakpointData(auxData: {
        type: Protocol.DOMDebugger.DOMBreakpointType;
        nodeId: Protocol.DOM.NodeId;
        targetNodeId: Protocol.DOM.NodeId;
        insertion: boolean;
    }): {
        type: Protocol.DOMDebugger.DOMBreakpointType;
        node: DOMNode;
        targetNode: DOMNode | null;
        insertion: boolean;
    } | null;
    private currentURL;
    private documentUpdated;
    private removeDOMBreakpoints;
    private nodeRemoved;
    private saveDOMBreakpoints;
}
export declare const enum Events {
    DOM_BREAKPOINT_ADDED = "DOMBreakpointAdded",
    DOM_BREAKPOINT_TOGGLED = "DOMBreakpointToggled",
    DOM_BREAKPOINTS_REMOVED = "DOMBreakpointsRemoved"
}
export interface EventTypes {
    [Events.DOM_BREAKPOINT_ADDED]: DOMBreakpoint;
    [Events.DOM_BREAKPOINT_TOGGLED]: DOMBreakpoint;
    [Events.DOM_BREAKPOINTS_REMOVED]: DOMBreakpoint[];
}
export declare class DOMBreakpoint {
    domDebuggerModel: DOMDebuggerModel;
    node: DOMNode;
    type: Protocol.DOMDebugger.DOMBreakpointType;
    enabled: boolean;
    constructor(domDebuggerModel: DOMDebuggerModel, node: DOMNode, type: Protocol.DOMDebugger.DOMBreakpointType, enabled: boolean);
}
export declare class EventListener {
    #private;
    constructor(domDebuggerModel: DOMDebuggerModel, eventTarget: RemoteObject, type: string, useCapture: boolean, passive: boolean, once: boolean, handler: RemoteObject | null, originalHandler: RemoteObject | null, location: Location, customRemoveFunction: RemoteObject | null, origin?: string);
    domDebuggerModel(): DOMDebuggerModel;
    type(): string;
    useCapture(): boolean;
    passive(): boolean;
    once(): boolean;
    handler(): RemoteObject | null;
    location(): Location;
    sourceURL(): Platform.DevToolsPath.UrlString;
    originalHandler(): RemoteObject | null;
    canRemove(): boolean;
    remove(): Promise<void>;
    canTogglePassive(): boolean;
    togglePassive(): Promise<undefined>;
    origin(): string;
    markAsFramework(): void;
    isScrollBlockingType(): boolean;
}
export declare namespace EventListener {
    const enum Origin {
        RAW = "Raw",
        FRAMEWORK = "Framework",
        FRAMEWORK_USER = "FrameworkUser"
    }
}
export declare class CSPViolationBreakpoint extends CategorizedBreakpoint {
    #private;
    constructor(category: Category, type: Protocol.DOMDebugger.CSPViolationType);
    type(): Protocol.DOMDebugger.CSPViolationType;
}
export declare class DOMEventListenerBreakpoint extends CategorizedBreakpoint {
    #private;
    readonly eventTargetNames: string[];
    constructor(eventName: string, eventTargetNames: string[], category: Category, targetManager: TargetManager);
    setEnabled(enabled: boolean): void;
    updateOnModel(model: DOMDebuggerModel): void;
    static readonly listener = "listener:";
}
export declare class DOMDebuggerManager implements SDKModelObserver<DOMDebuggerModel> {
    #private;
    constructor(targetManager?: TargetManager);
    initialize(): void;
    static instance(opts?: {
        forceNew: boolean | null;
        targetManager?: TargetManager;
    }): DOMDebuggerManager;
    static removeInstance(): void;
    cspViolationBreakpoints(): CSPViolationBreakpoint[];
    private createEventListenerBreakpoints;
    resolveEventListenerBreakpoint({ eventName, targetName }: EventListenerPausedDetailsAuxData): DOMEventListenerBreakpoint | null;
    eventListenerBreakpoints(): DOMEventListenerBreakpoint[];
    updateCSPViolationBreakpoints(): void;
    private updateCSPViolationBreakpointsForModel;
    xhrBreakpoints(): Map<string, boolean>;
    private saveXHRBreakpoints;
    addXHRBreakpoint(url: string, enabled: boolean): void;
    removeXHRBreakpoint(url: string): void;
    toggleXHRBreakpoint(url: string, enabled: boolean): void;
    modelAdded(domDebuggerModel: DOMDebuggerModel): void;
    modelRemoved(_domDebuggerModel: DOMDebuggerModel): void;
}
