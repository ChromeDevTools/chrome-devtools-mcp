import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import { CSSModel } from './CSSModel.js';
import { OverlayModel } from './OverlayModel.js';
import { RemoteObject } from './RemoteObject.js';
import { RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { SecurityOrigin } from './SecurityOrigin.js';
import { type Target } from './Target.js';
import type { TargetManager } from './TargetManager.js';
export declare const enum NodeType {
    ELEMENT_NODE = 1,
    ATTRIBUTE_NODE = 2,
    TEXT_NODE = 3,
    CDATA_SECTION_NODE = 4,
    PROCESSING_INSTRUCTION_NODE = 7,
    COMMENT_NODE = 8,
    DOCUMENT_NODE = 9,
    DOCUMENT_TYPE_NODE = 10,
    DOCUMENT_FRAGMENT_NODE = 11
}
/** Keep this list in sync with https://w3c.github.io/aria/#state_prop_def **/
export declare const ARIA_ATTRIBUTES: Set<string>;
export declare enum DOMNodeEvents {
    TOP_LAYER_INDEX_CHANGED = "TopLayerIndexChanged",
    SCROLLABLE_FLAG_UPDATED = "ScrollableFlagUpdated",
    AD_RELATED_STATE_UPDATED = "AdRelatedStateUpdated",
    GRID_OVERLAY_STATE_CHANGED = "GridOverlayStateChanged",
    FLEX_CONTAINER_OVERLAY_STATE_CHANGED = "FlexContainerOverlayStateChanged",
    SCROLL_SNAP_OVERLAY_STATE_CHANGED = "ScrollSnapOverlayStateChanged",
    CONTAINER_QUERY_OVERLAY_STATE_CHANGED = "ContainerQueryOverlayStateChanged"
}
export interface DOMNodeEventTypes {
    [DOMNodeEvents.TOP_LAYER_INDEX_CHANGED]: void;
    [DOMNodeEvents.SCROLLABLE_FLAG_UPDATED]: void;
    [DOMNodeEvents.AD_RELATED_STATE_UPDATED]: void;
    [DOMNodeEvents.GRID_OVERLAY_STATE_CHANGED]: {
        enabled: boolean;
    };
    [DOMNodeEvents.FLEX_CONTAINER_OVERLAY_STATE_CHANGED]: {
        enabled: boolean;
    };
    [DOMNodeEvents.SCROLL_SNAP_OVERLAY_STATE_CHANGED]: {
        enabled: boolean;
    };
    [DOMNodeEvents.CONTAINER_QUERY_OVERLAY_STATE_CHANGED]: {
        enabled: boolean;
    };
}
export declare function cssEscape(value: string): string;
export declare class DOMNode extends Common.ObjectWrapper.ObjectWrapper<DOMNodeEventTypes> {
    #private;
    ownerDocument: DOMDocument | null;
    id: Protocol.DOM.NodeId;
    index: number | undefined;
    nodeValueInternal: string;
    assignedSlot: DOMNodeShortcut | null;
    readonly shadowRootsInternal: DOMNode[];
    childNodeCountInternal: number;
    childrenInternal: DOMNode[] | null;
    nextSibling: DOMNode | null;
    previousSibling: DOMNode | null;
    firstChild: DOMNode | null;
    lastChild: DOMNode | null;
    parentNode: DOMNode | null;
    templateContentInternal?: DOMNode;
    contentDocumentInternal?: DOMDocument;
    childDocumentPromiseForTesting?: Promise<DOMDocument | null>;
    publicId?: string;
    systemId?: string;
    internalSubset?: string;
    name?: string;
    value?: string;
    /**
     * Set when a DOMNode is retained in a detached sub-tree.
     */
    retained: boolean;
    /**
     * Set if a DOMNode is a root of a detached sub-tree.
     */
    detached: boolean;
    constructor(domModel: DOMModel);
    static create(domModel: DOMModel, doc: DOMDocument | null, isInShadowTree: boolean, payload: Protocol.DOM.Node, retainedNodes?: Set<Protocol.DOM.BackendNodeId>): DOMNode;
    init(doc: DOMDocument | null, isInShadowTree: boolean, payload: Protocol.DOM.Node, retainedNodes?: Set<Protocol.DOM.BackendNodeId>): void;
    private requestChildDocument;
    setTopLayerIndex(idx: number): void;
    topLayerIndex(): number;
    /**
     * Returns the security origin of the document owning this node, or `null` if
     * this node is not attached to a document.
     */
    securityOrigin(): SecurityOrigin | null;
    adProvenance(): Protocol.Network.AdProvenance | undefined;
    isRootNode(): boolean;
    isSVGNode(): boolean;
    isScrollable(): boolean;
    affectedByStartingStyles(): boolean;
    isMediaNode(): boolean;
    isViewTransitionPseudoNode(): boolean;
    creationStackTrace(): Promise<Protocol.Runtime.StackTrace | null>;
    get subtreeMarkerCount(): number;
    domModel(): DOMModel;
    backendNodeId(): Protocol.DOM.BackendNodeId;
    children(): DOMNode[] | null;
    setChildren(children: DOMNode[]): void;
    setIsScrollable(isScrollable: boolean): void;
    setIsAdRelated(adProvenance?: Protocol.Network.AdProvenance): void;
    setAffectedByStartingStyles(affectedByStartingStyles: boolean): void;
    hasAttributes(): boolean;
    childNodeCount(): number;
    setChildNodeCount(childNodeCount: number): void;
    shadowRoots(): DOMNode[];
    templateContent(): DOMNode | null;
    contentDocument(): DOMDocument | null;
    setContentDocument(node: DOMDocument): void;
    isIframe(): boolean;
    importedDocument(): DOMNode | null;
    nodeType(): number;
    nodeName(): string;
    pseudoType(): string | undefined;
    pseudoIdentifier(): string | undefined;
    hasPseudoElements(): boolean;
    pseudoElements(): Map<string, DOMNode[]>;
    checkmarkPseudoElement(): DOMNode | undefined;
    beforePseudoElement(): DOMNode | undefined;
    afterPseudoElement(): DOMNode | undefined;
    pickerIconPseudoElement(): DOMNode | undefined;
    interestButtonPseudoElement(): DOMNode | undefined;
    markerPseudoElement(): DOMNode | undefined;
    backdropPseudoElement(): DOMNode | undefined;
    viewTransitionPseudoElements(): DOMNode[];
    carouselPseudoElements(): DOMNode[];
    hasAssignedSlot(): boolean;
    isInsertionPoint(): boolean;
    distributedNodes(): DOMNodeShortcut[];
    isInShadowTree(): boolean;
    getTreeRoot(): DOMNode;
    ancestorShadowHost(): DOMNode | null;
    ancestorShadowRoot(): DOMNode | null;
    ancestorUserAgentShadowRoot(): DOMNode | null;
    isShadowRoot(): boolean;
    shadowRootType(): string | null;
    nodeNameInCorrectCase(): string;
    setNodeName(name: string, callback?: ((arg0: string | null, arg1: DOMNode | null) => void)): void;
    localName(): string;
    nodeValue(): string;
    setNodeValueInternal(nodeValue: string): void;
    setNodeValue(value: string, callback?: ((arg0: string | null) => void)): void;
    getAttribute(name: string): string | undefined;
    setAttribute(name: string, text: string, callback?: ((arg0: string | null) => void)): void;
    setAttributeValue(name: string, value: string, callback?: ((arg0: string | null) => void)): void;
    setAttributeValuePromise(name: string, value: string): Promise<string | null>;
    attributes(): Attribute[];
    removeAttribute(name: string): Promise<void>;
    getChildNodesPromise(): Promise<DOMNode[] | null>;
    getChildNodes(callback: (arg0: DOMNode[] | null) => void): void;
    getSubtree(depth: number, pierce: boolean): Promise<DOMNode[] | null>;
    getOuterHTML(includeShadowDOM?: boolean): Promise<string | null>;
    setOuterHTML(html: string, callback?: ((arg0: string | null) => void)): void;
    removeNode(callback?: ((arg0: string | null, arg1?: Protocol.DOM.NodeId | undefined) => void)): Promise<void>;
    path(): string;
    isAncestor(node: DOMNode): boolean;
    isDescendant(descendant: DOMNode): boolean;
    frameOwnerFrameId(): Protocol.Page.FrameId | null;
    frameId(): Protocol.Page.FrameId | null;
    setAttributesPayload(attrs: string[]): boolean;
    insertChild(prev: DOMNode | undefined, payload: Protocol.DOM.Node): DOMNode;
    removeChild(node: DOMNode): void;
    setChildrenPayload(payloads: Protocol.DOM.Node[]): void;
    private setPseudoElements;
    private toAdoptedStyleSheets;
    setAdoptedStyleSheets(ids: Protocol.DOM.StyleSheetId[]): void;
    get adoptedStyleSheetsForNode(): AdoptedStyleSheet[];
    setDistributedNodePayloads(payloads: Protocol.DOM.BackendNode[]): void;
    setAssignedSlot(payload: Protocol.DOM.BackendNode): void;
    private renumber;
    private addAttribute;
    setAttributeInternal(name: string, value: string): void;
    removeAttributeInternal(name: string): void;
    copyTo(targetNode: DOMNode, anchorNode: DOMNode | null, callback?: ((arg0: string | null, arg1: DOMNode | null) => void)): void;
    moveTo(targetNode: DOMNode, anchorNode: DOMNode | null, callback?: ((arg0: string | null, arg1: DOMNode | null) => void)): void;
    duplicate(): Promise<{
        error: string | null;
        node: DOMNode | null;
    }>;
    /**
     * Runs a script on the node's remote object that toggles a class name on
     * the node and injects a stylesheet into the head of the node's document
     * containing a rule to set "visibility: hidden" on the class and all it's
     * ancestors.
     */
    toggleHideElement(): Promise<void>;
    isToggledToHidden(): boolean;
    isXMLNode(): boolean;
    isCustomElement(): boolean;
    setMarker(name: string, value: unknown): void;
    marker<T>(name: string): T | null;
    getMarkerKeysForTest(): string[];
    traverseMarkers(visitor: (arg0: DOMNode, arg1: string) => void): void;
    resolveURL(url: string): Platform.DevToolsPath.UrlString | null;
    highlight(mode?: string): void;
    highlightForTwoSeconds(): void;
    resolveToObject(objectGroup?: string, executionContextId?: Protocol.Runtime.ExecutionContextId): Promise<RemoteObject | null>;
    boxModel(): Promise<Protocol.DOM.BoxModel | null>;
    canInspectNode(): boolean;
    setAsInspectedNode(): Promise<void>;
    enclosingElementOrSelf(): DOMNode | null;
    callFunction<T, U extends string | number, This = never>(fn: (this: This, ...args: U[]) => T, args?: U[]): Promise<{
        value: T;
    } | null>;
    saveNodeToTempVariable(): Promise<void>;
    scrollIntoView(): Promise<void>;
    focus(): Promise<void>;
    simpleSelector(): string;
    getAnchorBySpecifier(specifier?: string): Promise<DOMNode | null>;
    getImplicitAnchorCandidates(): Promise<DeferredDOMNode[]>;
    takeSnapshot(ownerDocumentSnapshot?: DOMDocument): Promise<DOMNode>;
    classNames(): string[];
}
export declare namespace DOMNode {
    enum ShadowRootTypes {
        UserAgent = "user-agent",
        Open = "open",
        Closed = "closed"
    }
}
export declare class DeferredDOMNode {
    #private;
    constructor(target: Target, backendNodeId: Protocol.DOM.BackendNodeId);
    resolve(callback: (arg0: DOMNode | null) => void): void;
    resolvePromise(): Promise<DOMNode | null>;
    backendNodeId(): Protocol.DOM.BackendNodeId;
    domModel(): DOMModel;
    highlight(): void;
}
export declare class DOMNodeShortcut {
    nodeType: number;
    nodeName: string;
    deferredNode: DeferredDOMNode;
    childShortcuts: DOMNodeShortcut[];
    constructor(target: Target, backendNodeId: Protocol.DOM.BackendNodeId, nodeType: number, nodeName: string, childShortcuts?: DOMNodeShortcut[]);
}
export declare class DOMDocument extends DOMNode {
    #private;
    body: DOMNode | null;
    documentElement: DOMNode | null;
    constructor(domModel: DOMModel, payload: Protocol.DOM.Node, frameId?: Protocol.Page.FrameId | null);
    get documentURL(): Platform.DevToolsPath.UrlString;
    get baseURL(): Platform.DevToolsPath.UrlString;
    frameId(): Protocol.Page.FrameId | null;
    /**
     * Returns the security origin of this document.
     *
     * The security origin is resolved from the document's frame and is recomputed
     * when the document navigates to a new URL via `setDocumentURL`.
     */
    securityOrigin(): SecurityOrigin;
    /**
     * Updates the document and base URLs, and updates the document's security origin.
     */
    setDocumentURL(url: Platform.DevToolsPath.UrlString, securityOrigin?: SecurityOrigin | null): void;
}
export declare class AdoptedStyleSheet {
    readonly id: Protocol.DOM.StyleSheetId;
    readonly parent: DOMNode;
    constructor(id: Protocol.DOM.StyleSheetId, parent: DOMNode);
    get cssModel(): CSSModel;
}
export declare class DOMModel extends SDKModel<EventTypes> {
    #private;
    agent: ProtocolProxyApi.DOMApi;
    idToDOMNode: Map<Protocol.DOM.NodeId, DOMNode>;
    frameIdToOwnerNode: Map<Protocol.Page.FrameId, DOMNode>;
    readonly runtimeModelInternal: RuntimeModel;
    constructor(target: Target);
    runtimeModel(): RuntimeModel;
    cssModel(): CSSModel;
    overlayModel(): OverlayModel;
    static cancelSearch(targetManager: TargetManager): void;
    private scheduleMutationEvent;
    private onDocumentOpened;
    requestDocument(): Promise<DOMDocument | null>;
    getOwnerNodeForFrame(frameId: Protocol.Page.FrameId): Promise<DeferredDOMNode | null>;
    private requestDocumentInternal;
    existingDocument(): DOMDocument | null;
    pushNodeToFrontend(objectId: Protocol.Runtime.RemoteObjectId): Promise<DOMNode | null>;
    pushNodeByPathToFrontend(path: string): Promise<Protocol.DOM.NodeId | null>;
    pushNodesByBackendIdsToFrontend(backendNodeIds: Set<Protocol.DOM.BackendNodeId>): Promise<Map<Protocol.DOM.BackendNodeId, DOMNode | null> | null>;
    attributeModified(nodeId: Protocol.DOM.NodeId, name: string, value: string): void;
    attributeRemoved(nodeId: Protocol.DOM.NodeId, name: string): void;
    inlineStyleInvalidated(nodeIds: Protocol.DOM.NodeId[]): void;
    private loadNodeAttributes;
    characterDataModified(nodeId: Protocol.DOM.NodeId, newValue: string): void;
    nodeForId(nodeId: Protocol.DOM.NodeId | null): DOMNode | null;
    documentUpdated(): void;
    private setDocument;
    setDocumentForTest(document: Protocol.DOM.Node | null): void;
    private setDetachedRoot;
    setChildNodes(parentId: Protocol.DOM.NodeId, payloads: Protocol.DOM.Node[]): void;
    childNodeCountUpdated(nodeId: Protocol.DOM.NodeId, newValue: number): void;
    childNodeInserted(parentId: Protocol.DOM.NodeId, prevId: Protocol.DOM.NodeId, payload: Protocol.DOM.Node): void;
    childNodeRemoved(parentId: Protocol.DOM.NodeId, nodeId: Protocol.DOM.NodeId): void;
    shadowRootPushed(hostId: Protocol.DOM.NodeId, root: Protocol.DOM.Node): void;
    shadowRootPopped(hostId: Protocol.DOM.NodeId, rootId: Protocol.DOM.NodeId): void;
    pseudoElementAdded(parentId: Protocol.DOM.NodeId, pseudoElement: Protocol.DOM.Node): void;
    adoptedStyleSheetsModified(parentId: Protocol.DOM.NodeId, styleSheets: Protocol.DOM.StyleSheetId[]): void;
    scrollableFlagUpdated(nodeId: Protocol.DOM.NodeId, isScrollable: boolean): void;
    adRelatedStateUpdated(nodeId: Protocol.DOM.NodeId, adProvenance?: Protocol.Network.AdProvenance): void;
    affectedByStartingStylesFlagUpdated(nodeId: Protocol.DOM.NodeId, affectedByStartingStyles: boolean): void;
    pseudoElementRemoved(parentId: Protocol.DOM.NodeId, pseudoElementId: Protocol.DOM.NodeId): void;
    distributedNodesUpdated(insertionPointId: Protocol.DOM.NodeId, distributedNodes: Protocol.DOM.BackendNode[]): void;
    private unbind;
    getNodesByStyle(computedStyles: Array<{
        name: string;
        value: string;
    }>, pierce?: boolean): Promise<Protocol.DOM.NodeId[]>;
    performSearch(query: string, includeUserAgentShadowDOM: boolean): Promise<number>;
    searchResult(index: number): Promise<DOMNode | null>;
    private cancelSearch;
    classNamesPromise(nodeId: Protocol.DOM.NodeId): Promise<string[]>;
    querySelector(nodeId: Protocol.DOM.NodeId, selector: string): Promise<Protocol.DOM.NodeId | null>;
    querySelectorAll(nodeId: Protocol.DOM.NodeId, selector: string): Promise<Protocol.DOM.NodeId[] | null>;
    getTopLayerElements(): Promise<Protocol.DOM.NodeId[] | null>;
    topLayerElementsUpdated(): void;
    getDetachedDOMNodes(): Promise<Protocol.DOM.DetachedElementInfo[] | null>;
    getElementByRelation(nodeId: Protocol.DOM.NodeId, relation: Protocol.DOM.GetElementByRelationRequestRelation): Promise<Protocol.DOM.NodeId | null>;
    markUndoableState(minorChange?: boolean): void;
    nodeForLocation(x: number, y: number, includeUserAgentShadowDOM: boolean): Promise<DOMNode | null>;
    getContainerForNode(nodeId: Protocol.DOM.NodeId, containerName?: string, physicalAxes?: Protocol.DOM.PhysicalAxes, logicalAxes?: Protocol.DOM.LogicalAxes, queriesScrollState?: boolean, queriesAnchored?: boolean): Promise<DOMNode | null>;
    pushObjectAsNodeToFrontend(object: RemoteObject): Promise<DOMNode | null>;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    dispose(): void;
    parentModel(): DOMModel | null;
    getAgent(): ProtocolProxyApi.DOMApi;
    registerNode(node: DOMNode): void;
}
export declare enum Events {
    AttrModified = "AttrModified",
    AttrRemoved = "AttrRemoved",
    CharacterDataModified = "CharacterDataModified",
    DOMMutated = "DOMMutated",
    DocumentURLChanged = "DocumentURLChanged",
    NodeInserted = "NodeInserted",
    NodeRemoved = "NodeRemoved",
    DocumentUpdated = "DocumentUpdated",
    ChildNodeCountUpdated = "ChildNodeCountUpdated",
    DistributedNodesChanged = "DistributedNodesChanged",
    MarkersChanged = "MarkersChanged",
    TopLayerElementsChanged = "TopLayerElementsChanged",
    AffectedByStartingStylesFlagUpdated = "AffectedByStartingStylesFlagUpdated",
    AdoptedStyleSheetsModified = "AdoptedStyleSheetsModified"
}
export interface EventTypes {
    [Events.AttrModified]: {
        node: DOMNode;
        name: string;
    };
    [Events.AttrRemoved]: {
        node: DOMNode;
        name: string;
    };
    [Events.CharacterDataModified]: DOMNode;
    [Events.DOMMutated]: DOMNode;
    [Events.DocumentURLChanged]: DOMDocument;
    [Events.NodeInserted]: DOMNode;
    [Events.NodeRemoved]: {
        node: DOMNode;
        parent: DOMNode;
    };
    [Events.DocumentUpdated]: DOMModel;
    [Events.ChildNodeCountUpdated]: DOMNode;
    [Events.DistributedNodesChanged]: DOMNode;
    [Events.MarkersChanged]: DOMNode;
    [Events.TopLayerElementsChanged]: {
        document: DOMDocument;
        documentShortcuts: DOMNodeShortcut[];
    };
    [Events.AffectedByStartingStylesFlagUpdated]: {
        node: DOMNode;
    };
    [Events.AdoptedStyleSheetsModified]: DOMNode;
}
export declare class DOMModelUndoStack {
    #private;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): DOMModelUndoStack;
    markUndoableState(model: DOMModel, minorChange: boolean): Promise<void>;
    undo(): Promise<void>;
    redo(): Promise<void>;
    dispose(model: DOMModel): void;
}
export declare class DOMNodeSnapshot extends DOMNode {
    init(_doc: DOMDocument | null, _isInShadowTree: boolean, _payload: Protocol.DOM.Node, _retainedNodes?: Set<Protocol.DOM.BackendNodeId> | undefined): void;
    setNodeName(_name: string, _callback?: ((arg0: string | null, arg1: DOMNode | null) => void) | undefined): void;
    setNodeValue(_value: string, _callback?: ((arg0: string | null) => void) | undefined): void;
    setAttribute(_name: string, _text: string, _callback?: ((arg0: string | null) => void) | undefined): void;
    setAttributeValue(_name: string, _value: string, _callback?: ((arg0: string | null) => void) | undefined): void;
    removeAttribute(_name: string): Promise<void>;
    setOuterHTML(_html: string, _callback?: ((arg0: string | null) => void) | undefined): void;
    removeNode(_callback?: ((arg0: string | null, arg1?: Protocol.DOM.NodeId | undefined) => void) | undefined): Promise<void>;
    copyTo(_targetNode: DOMNode, _anchorNode: DOMNode | null, _callback?: ((arg0: string | null, arg1: DOMNode | null) => void) | undefined): void;
    moveTo(_targetNode: DOMNode, _anchorNode: DOMNode | null, _callback?: ((arg0: string | null, arg1: DOMNode | null) => void) | undefined): void;
    duplicate(): Promise<{
        error: string | null;
        node: DOMNode | null;
    }>;
    canInspectNode(): boolean;
    setAsInspectedNode(): Promise<void>;
}
export declare class DOMDocumentSnapshot extends DOMDocument {
    #private;
    constructor(domModel: DOMModel, payload: Protocol.DOM.Node, frameId: Protocol.Page.FrameId | null | undefined, securityOrigin: SecurityOrigin);
    securityOrigin(): SecurityOrigin;
    init(_doc: DOMDocument | null, _isInShadowTree: boolean, _payload: Protocol.DOM.Node, _retainedNodes?: Set<Protocol.DOM.BackendNodeId> | undefined): void;
    setNodeName(_name: string, _callback?: ((arg0: string | null, arg1: DOMNode | null) => void) | undefined): void;
    setNodeValue(_value: string, _callback?: ((arg0: string | null) => void) | undefined): void;
    setAttribute(_name: string, _text: string, _callback?: ((arg0: string | null) => void) | undefined): void;
    setAttributeValue(_name: string, _value: string, _callback?: ((arg0: string | null) => void) | undefined): void;
    removeAttribute(_name: string): Promise<void>;
    setOuterHTML(_html: string, _callback?: ((arg0: string | null) => void) | undefined): void;
    removeNode(_callback?: ((arg0: string | null, arg1?: Protocol.DOM.NodeId | undefined) => void) | undefined): Promise<void>;
    copyTo(_targetNode: DOMNode, _anchorNode: DOMNode | null, _callback?: ((arg0: string | null, arg1: DOMNode | null) => void) | undefined): void;
    moveTo(_targetNode: DOMNode, _anchorNode: DOMNode | null, _callback?: ((arg0: string | null, arg1: DOMNode | null) => void) | undefined): void;
    duplicate(): Promise<{
        error: string | null;
        node: DOMNode | null;
    }>;
    canInspectNode(): boolean;
    setAsInspectedNode(): Promise<void>;
}
export interface Attribute {
    name: string;
    value: string;
    _node: DOMNode;
}
