import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import { DeferredDOMNode, type DOMNode } from './DOMModel.js';
import type { FrameManager } from './FrameManager.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare const enum CoreAxPropertyName {
    NAME = "name",
    DESCRIPTION = "description",
    VALUE = "value",
    ROLE = "role"
}
export interface CoreOrProtocolAxProperty {
    name: CoreAxPropertyName | Protocol.Accessibility.AXPropertyName;
    value: Protocol.Accessibility.AXValue;
}
export declare class AccessibilityNode {
    #private;
    constructor(accessibilityModel: AccessibilityModel, payload: Protocol.Accessibility.AXNode);
    id(): Protocol.Accessibility.AXNodeId;
    accessibilityModel(): AccessibilityModel;
    ignored(): boolean;
    ignoredReasons(): Protocol.Accessibility.AXProperty[] | null;
    role(): Protocol.Accessibility.AXValue | null;
    coreProperties(): CoreOrProtocolAxProperty[];
    name(): Protocol.Accessibility.AXValue | null;
    description(): Protocol.Accessibility.AXValue | null;
    value(): Protocol.Accessibility.AXValue | null;
    properties(): Protocol.Accessibility.AXProperty[] | null;
    parentNode(): AccessibilityNode | null;
    isDOMNode(): boolean;
    backendDOMNodeId(): Protocol.DOM.BackendNodeId | null;
    deferredDOMNode(): DeferredDOMNode | null;
    highlightDOMNode(): void;
    children(): AccessibilityNode[];
    numChildren(): number;
    hasOnlyUnloadedChildren(): boolean;
    hasUnloadedChildren(): boolean;
    getFrameId(): Protocol.Page.FrameId | null;
    isLeafNode(): boolean;
    getNodeId(): string;
    getChildren(): Promise<AccessibilityNode[]>;
    axNodeToText(depth?: number): Promise<string>;
}
export declare const enum Events {
    TREE_UPDATED = "TreeUpdated"
}
export interface EventTypes {
    [Events.TREE_UPDATED]: {
        root?: AccessibilityNode;
    };
}
export declare class AccessibilityModel extends SDKModel<EventTypes> implements ProtocolProxyApi.AccessibilityDispatcher {
    #private;
    agent: ProtocolProxyApi.AccessibilityApi;
    constructor(target: Target);
    clear(): void;
    resumeModel(): Promise<void>;
    suspendModel(): Promise<void>;
    requestPartialAXTree(node: DOMNode): Promise<void>;
    loadComplete({ root }: Protocol.Accessibility.LoadCompleteEvent): void;
    nodesUpdated({ nodes }: Protocol.Accessibility.NodesUpdatedEvent): void;
    private createNodesFromPayload;
    requestRootNode(frameId?: Protocol.Page.FrameId): Promise<AccessibilityNode | undefined>;
    requestAXChildren(nodeId: Protocol.Accessibility.AXNodeId, frameId?: Protocol.Page.FrameId): Promise<AccessibilityNode[]>;
    requestAndLoadSubTreeToNode(node: DOMNode): Promise<AccessibilityNode[] | null>;
    axNodeForId(axId: Protocol.Accessibility.AXNodeId): AccessibilityNode | null;
    setRootAXNodeForFrameId(frameId: Protocol.Page.FrameId, axNode: AccessibilityNode): void;
    setAXNodeForAXId(axId: string, axNode: AccessibilityNode): void;
    axNodeForDOMNode(domNode: DOMNode | null): AccessibilityNode | null;
    setAXNodeForBackendDOMNodeId(backendDOMNodeId: Protocol.DOM.BackendNodeId, axNode: AccessibilityNode): void;
    getAgent(): ProtocolProxyApi.AccessibilityApi;
}
export declare function getRootNode(frameId: Protocol.Page.FrameId, frameManager: FrameManager): Promise<AccessibilityNode>;
export declare function getNodeAndAncestorsFromDOMNode(domNode: DOMNode): Promise<AccessibilityNode[]>;
export declare function isPrintableType(valueType: Protocol.Accessibility.AXValueType): boolean;
