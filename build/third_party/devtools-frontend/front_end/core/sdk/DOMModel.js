// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { ConsoleModel } from './ConsoleModel.js';
import { CSSModel } from './CSSModel.js';
import { OverlayModel } from './OverlayModel.js';
import { focusInPage, scrollIntoViewInPage, toggleClassAndInjectStyleRule } from './PageFunctions.js';
import { RemoteObject } from './RemoteObject.js';
import { Events as ResourceTreeModelEvents, ResourceTreeModel } from './ResourceTreeModel.js';
import { RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { SecurityOrigin } from './SecurityOrigin.js';
export var NodeType;
(function (NodeType) {
    NodeType[NodeType["ELEMENT_NODE"] = 1] = "ELEMENT_NODE";
    NodeType[NodeType["ATTRIBUTE_NODE"] = 2] = "ATTRIBUTE_NODE";
    NodeType[NodeType["TEXT_NODE"] = 3] = "TEXT_NODE";
    NodeType[NodeType["CDATA_SECTION_NODE"] = 4] = "CDATA_SECTION_NODE";
    NodeType[NodeType["PROCESSING_INSTRUCTION_NODE"] = 7] = "PROCESSING_INSTRUCTION_NODE";
    NodeType[NodeType["COMMENT_NODE"] = 8] = "COMMENT_NODE";
    NodeType[NodeType["DOCUMENT_NODE"] = 9] = "DOCUMENT_NODE";
    NodeType[NodeType["DOCUMENT_TYPE_NODE"] = 10] = "DOCUMENT_TYPE_NODE";
    NodeType[NodeType["DOCUMENT_FRAGMENT_NODE"] = 11] = "DOCUMENT_FRAGMENT_NODE";
})(NodeType || (NodeType = {}));
/** Keep this list in sync with https://w3c.github.io/aria/#state_prop_def **/
export const ARIA_ATTRIBUTES = new Set([
    'role',
    'aria-activedescendant',
    'aria-atomic',
    'aria-autocomplete',
    'aria-braillelabel',
    'aria-brailleroledescription',
    'aria-busy',
    'aria-checked',
    'aria-colcount',
    'aria-colindex',
    'aria-colindextext',
    'aria-colspan',
    'aria-controls',
    'aria-current',
    'aria-describedby',
    'aria-description',
    'aria-details',
    'aria-disabled',
    'aria-dropeffect',
    'aria-errormessage',
    'aria-expanded',
    'aria-flowto',
    'aria-grabbed',
    'aria-haspopup',
    'aria-hidden',
    'aria-invalid',
    'aria-keyshortcuts',
    'aria-label',
    'aria-labelledby',
    'aria-level',
    'aria-live',
    'aria-modal',
    'aria-multiline',
    'aria-multiselectable',
    'aria-orientation',
    'aria-owns',
    'aria-placeholder',
    'aria-posinset',
    'aria-pressed',
    'aria-readonly',
    'aria-relevant',
    'aria-required',
    'aria-roledescription',
    'aria-rowcount',
    'aria-rowindex',
    'aria-rowindextext',
    'aria-rowspan',
    'aria-selected',
    'aria-setsize',
    'aria-sort',
    'aria-valuemax',
    'aria-valuemin',
    'aria-valuenow',
    'aria-valuetext',
]);
export var DOMNodeEvents;
(function (DOMNodeEvents) {
    DOMNodeEvents["TOP_LAYER_INDEX_CHANGED"] = "TopLayerIndexChanged";
    DOMNodeEvents["SCROLLABLE_FLAG_UPDATED"] = "ScrollableFlagUpdated";
    DOMNodeEvents["AD_RELATED_STATE_UPDATED"] = "AdRelatedStateUpdated";
    DOMNodeEvents["GRID_OVERLAY_STATE_CHANGED"] = "GridOverlayStateChanged";
    DOMNodeEvents["FLEX_CONTAINER_OVERLAY_STATE_CHANGED"] = "FlexContainerOverlayStateChanged";
    DOMNodeEvents["SCROLL_SNAP_OVERLAY_STATE_CHANGED"] = "ScrollSnapOverlayStateChanged";
    DOMNodeEvents["CONTAINER_QUERY_OVERLAY_STATE_CHANGED"] = "ContainerQueryOverlayStateChanged";
})(DOMNodeEvents || (DOMNodeEvents = {}));
export function cssEscape(value) {
    const length = value.length;
    let index = -1;
    let codeUnit;
    let result = '';
    const firstCodeUnit = value.charCodeAt(0);
    if (length === 0) {
        return '';
    }
    if (length === 1 && firstCodeUnit === 0x002D) {
        return '\\' + value;
    }
    while (++index < length) {
        codeUnit = value.charCodeAt(index);
        if (codeUnit === 0x0000) {
            result += '\uFFFD';
            continue;
        }
        if ((codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit === 0x007F ||
            (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
            (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002D)) {
            result += '\\' + codeUnit.toString(16) + ' ';
            continue;
        }
        if (codeUnit >= 0x0080 || codeUnit === 0x002D || codeUnit === 0x005F ||
            (codeUnit >= 0x0030 && codeUnit <= 0x0039) || (codeUnit >= 0x0041 && codeUnit <= 0x005A) ||
            (codeUnit >= 0x0061 && codeUnit <= 0x007A)) {
            result += value.charAt(index);
            continue;
        }
        result += '\\' + value.charAt(index);
    }
    return result;
}
export class DOMNode extends Common.ObjectWrapper.ObjectWrapper {
    #domModel;
    #frameManager;
    #agent;
    ownerDocument;
    #isInShadowTree;
    id;
    index = undefined;
    #backendNodeId;
    #nodeType;
    #nodeName;
    #localName;
    nodeValueInternal;
    #pseudoType;
    #pseudoIdentifier;
    #shadowRootType;
    #frameOwnerFrameId;
    #xmlVersion;
    #isSVGNode;
    #isScrollable;
    #affectedByStartingStyles;
    #creationStackTrace = null;
    #pseudoElements = new Map();
    #distributedNodes = [];
    assignedSlot = null;
    shadowRootsInternal = [];
    #attributes = new Map();
    #markers = new Map();
    #subtreeMarkerCount = 0;
    childNodeCountInternal;
    childrenInternal = null;
    nextSibling = null;
    previousSibling = null;
    firstChild = null;
    lastChild = null;
    parentNode = null;
    templateContentInternal;
    contentDocumentInternal;
    childDocumentPromiseForTesting;
    #importedDocument;
    publicId;
    systemId;
    internalSubset;
    name;
    value;
    /**
     * Set when a DOMNode is retained in a detached sub-tree.
     */
    retained = false;
    /**
     * Set if a DOMNode is a root of a detached sub-tree.
     */
    detached = false;
    #retainedNodes;
    #adoptedStyleSheets = [];
    /**
     * 1-based index of the node in the top layer. Only set
     * for non-backdrop nodes.
     */
    #topLayerIndex = -1;
    /**
     * Set if a DOMNode is ad related.
     */
    #adProvenance;
    constructor(domModel) {
        super();
        this.#domModel = domModel;
        this.#frameManager = domModel.target().targetManager().getFrameManager();
        this.#agent = this.#domModel.getAgent();
    }
    static create(domModel, doc, isInShadowTree, payload, retainedNodes) {
        const node = new DOMNode(domModel);
        node.init(doc, isInShadowTree, payload, retainedNodes);
        return node;
    }
    init(doc, isInShadowTree, payload, retainedNodes) {
        this.#agent = this.#domModel.getAgent();
        this.ownerDocument = doc;
        this.#isInShadowTree = isInShadowTree;
        this.id = payload.nodeId;
        this.#backendNodeId = payload.backendNodeId;
        this.#frameOwnerFrameId = payload.frameId || null;
        this.#domModel.registerNode(this);
        this.#nodeType = payload.nodeType;
        this.#nodeName = payload.nodeName;
        this.#localName = payload.localName;
        this.nodeValueInternal = payload.nodeValue;
        this.#pseudoType = payload.pseudoType;
        this.#pseudoIdentifier = payload.pseudoIdentifier;
        this.#shadowRootType = payload.shadowRootType;
        this.#xmlVersion = payload.xmlVersion;
        this.#isSVGNode = Boolean(payload.isSVG);
        this.#isScrollable = Boolean(payload.isScrollable);
        this.#affectedByStartingStyles = Boolean(payload.affectedByStartingStyles);
        this.#retainedNodes = retainedNodes;
        if (this.#retainedNodes?.has(this.backendNodeId())) {
            this.retained = true;
        }
        if (payload.attributes) {
            this.setAttributesPayload(payload.attributes);
        }
        if (payload.adoptedStyleSheets) {
            this.#adoptedStyleSheets = this.toAdoptedStyleSheets(payload.adoptedStyleSheets);
        }
        this.childNodeCountInternal = payload.childNodeCount || 0;
        if (payload.shadowRoots) {
            for (let i = 0; i < payload.shadowRoots.length; ++i) {
                const root = payload.shadowRoots[i];
                const node = DOMNode.create(this.#domModel, this.ownerDocument, true, root, retainedNodes);
                this.shadowRootsInternal.push(node);
                node.parentNode = this;
            }
        }
        if (payload.templateContent) {
            this.templateContentInternal =
                DOMNode.create(this.#domModel, this.ownerDocument, true, payload.templateContent, retainedNodes);
            this.templateContentInternal.parentNode = this;
            this.childrenInternal = [];
        }
        const frameOwnerTags = new Set(['EMBED', 'IFRAME', 'OBJECT', 'FENCEDFRAME']);
        if (payload.contentDocument) {
            this.contentDocumentInternal = new DOMDocument(this.#domModel, payload.contentDocument, payload.frameId);
            this.contentDocumentInternal.parentNode = this;
            this.childrenInternal = [];
        }
        else if (payload.frameId && frameOwnerTags.has(payload.nodeName)) {
            // At this point we know we are in an OOPIF, otherwise `payload.contentDocument` would have been set.
            this.childDocumentPromiseForTesting = this.requestChildDocument(payload.frameId, this.#domModel.target());
            this.childrenInternal = [];
        }
        if (payload.importedDocument) {
            this.#importedDocument =
                DOMNode.create(this.#domModel, this.ownerDocument, true, payload.importedDocument, retainedNodes);
            this.#importedDocument.parentNode = this;
            this.childrenInternal = [];
        }
        if (payload.distributedNodes) {
            this.setDistributedNodePayloads(payload.distributedNodes);
        }
        if (payload.assignedSlot) {
            this.setAssignedSlot(payload.assignedSlot);
        }
        if (payload.children) {
            this.setChildrenPayload(payload.children);
        }
        this.setPseudoElements(payload.pseudoElements);
        if (payload.adProvenance) {
            this.#adProvenance = payload.adProvenance;
        }
        if (this.#nodeType === 1 /* NodeType.ELEMENT_NODE */) {
            // HTML and BODY from internal iframes should not overwrite top-level ones.
            if (this.ownerDocument && !this.ownerDocument.documentElement && this.#nodeName === 'HTML') {
                this.ownerDocument.documentElement = this;
            }
            if (this.ownerDocument && !this.ownerDocument.body && this.#nodeName === 'BODY') {
                this.ownerDocument.body = this;
            }
        }
        else if (this.#nodeType === 10 /* NodeType.DOCUMENT_TYPE_NODE */) {
            this.publicId = payload.publicId;
            this.systemId = payload.systemId;
            this.internalSubset = payload.internalSubset;
        }
        else if (this.#nodeType === 2 /* NodeType.ATTRIBUTE_NODE */) {
            this.name = payload.name;
            this.value = payload.value;
        }
    }
    async requestChildDocument(frameId, notInTarget) {
        const frame = await this.#frameManager.getOrWaitForFrame(frameId, notInTarget);
        const childModel = frame.resourceTreeModel()?.target().model(DOMModel);
        return await (childModel?.requestDocument() || null);
    }
    setTopLayerIndex(idx) {
        const oldIndex = this.#topLayerIndex;
        this.#topLayerIndex = idx;
        if (oldIndex !== idx) {
            this.dispatchEventToListeners(DOMNodeEvents.TOP_LAYER_INDEX_CHANGED);
        }
    }
    topLayerIndex() {
        return this.#topLayerIndex;
    }
    /**
     * Returns the security origin of the document owning this node, or `null` if
     * this node is not attached to a document.
     */
    securityOrigin() {
        return this.ownerDocument?.securityOrigin() ?? null;
    }
    adProvenance() {
        if (this.#adProvenance !== undefined) {
            return this.#adProvenance;
        }
        // AdProvenance can be unavailable for deeply nested OOPIF ad iframes
        // (crbug.com/421202278). We rely on `AdFrameType` as a fallback.
        if (!this.isIframe() || !this.#frameOwnerFrameId) {
            return undefined;
        }
        const frame = this.#frameManager.getFrame(this.#frameOwnerFrameId);
        if (frame && frame.adFrameType() !== "none" /* Protocol.Page.AdFrameType.None */) {
            // The frame is ad-related, but provenance information is unavailable.
            return {};
        }
        return undefined;
    }
    isRootNode() {
        if (this.nodeType() === 1 /* NodeType.ELEMENT_NODE */ && this.nodeName() === 'HTML') {
            return true;
        }
        return false;
    }
    isSVGNode() {
        return this.#isSVGNode;
    }
    isScrollable() {
        return this.#isScrollable;
    }
    affectedByStartingStyles() {
        return this.#affectedByStartingStyles;
    }
    isMediaNode() {
        return this.#nodeName === 'AUDIO' || this.#nodeName === 'VIDEO';
    }
    isViewTransitionPseudoNode() {
        if (!this.#pseudoType) {
            return false;
        }
        return [
            "view-transition" /* Protocol.DOM.PseudoType.ViewTransition */,
            "view-transition-group" /* Protocol.DOM.PseudoType.ViewTransitionGroup */,
            "view-transition-group-children" /* Protocol.DOM.PseudoType.ViewTransitionGroupChildren */,
            "view-transition-image-pair" /* Protocol.DOM.PseudoType.ViewTransitionImagePair */,
            "view-transition-old" /* Protocol.DOM.PseudoType.ViewTransitionOld */,
            "view-transition-new" /* Protocol.DOM.PseudoType.ViewTransitionNew */,
        ].includes(this.#pseudoType);
    }
    creationStackTrace() {
        if (this.#creationStackTrace) {
            return this.#creationStackTrace;
        }
        const stackTracesPromise = this.#agent.invoke_getNodeStackTraces({ nodeId: this.id });
        this.#creationStackTrace = stackTracesPromise.then(res => res.creation || null);
        return this.#creationStackTrace;
    }
    get subtreeMarkerCount() {
        return this.#subtreeMarkerCount;
    }
    domModel() {
        return this.#domModel;
    }
    backendNodeId() {
        return this.#backendNodeId;
    }
    children() {
        return this.childrenInternal ? this.childrenInternal.slice() : null;
    }
    setChildren(children) {
        this.childrenInternal = children;
    }
    setIsScrollable(isScrollable) {
        this.#isScrollable = isScrollable;
        this.dispatchEventToListeners(DOMNodeEvents.SCROLLABLE_FLAG_UPDATED);
        if (this.nodeName() === '#document') {
            // We show the scroll badge of the document on the <html> element.
            this.ownerDocument?.documentElement?.setIsScrollable(isScrollable);
        }
    }
    setIsAdRelated(adProvenance) {
        this.#adProvenance = adProvenance;
        this.dispatchEventToListeners(DOMNodeEvents.AD_RELATED_STATE_UPDATED);
    }
    setAffectedByStartingStyles(affectedByStartingStyles) {
        this.#affectedByStartingStyles = affectedByStartingStyles;
    }
    hasAttributes() {
        return this.#attributes.size > 0;
    }
    childNodeCount() {
        return this.childNodeCountInternal;
    }
    setChildNodeCount(childNodeCount) {
        this.childNodeCountInternal = childNodeCount;
    }
    shadowRoots() {
        return this.shadowRootsInternal.slice();
    }
    templateContent() {
        return this.templateContentInternal || null;
    }
    contentDocument() {
        return this.contentDocumentInternal || null;
    }
    setContentDocument(node) {
        this.contentDocumentInternal = node;
    }
    isIframe() {
        return this.#nodeName === 'IFRAME';
    }
    importedDocument() {
        return this.#importedDocument || null;
    }
    nodeType() {
        return this.#nodeType;
    }
    nodeName() {
        return this.#nodeName;
    }
    pseudoType() {
        return this.#pseudoType;
    }
    pseudoIdentifier() {
        return this.#pseudoIdentifier;
    }
    hasPseudoElements() {
        return this.#pseudoElements.size > 0;
    }
    pseudoElements() {
        return this.#pseudoElements;
    }
    checkmarkPseudoElement() {
        return this.#pseudoElements.get("checkmark" /* Protocol.DOM.PseudoType.Checkmark */)?.at(-1);
    }
    beforePseudoElement() {
        return this.#pseudoElements.get("before" /* Protocol.DOM.PseudoType.Before */)?.at(-1);
    }
    afterPseudoElement() {
        return this.#pseudoElements.get("after" /* Protocol.DOM.PseudoType.After */)?.at(-1);
    }
    pickerIconPseudoElement() {
        return this.#pseudoElements.get("picker-icon" /* Protocol.DOM.PseudoType.PickerIcon */)?.at(-1);
    }
    interestButtonPseudoElement() {
        return this.#pseudoElements.get("interest-button" /* Protocol.DOM.PseudoType.InterestButton */)?.at(-1);
    }
    markerPseudoElement() {
        return this.#pseudoElements.get("marker" /* Protocol.DOM.PseudoType.Marker */)?.at(-1);
    }
    backdropPseudoElement() {
        return this.#pseudoElements.get("backdrop" /* Protocol.DOM.PseudoType.Backdrop */)?.at(-1);
    }
    viewTransitionPseudoElements() {
        return [
            ...this.#pseudoElements.get("view-transition" /* Protocol.DOM.PseudoType.ViewTransition */) || [],
            ...this.#pseudoElements.get("view-transition-group" /* Protocol.DOM.PseudoType.ViewTransitionGroup */) || [],
            ...this.#pseudoElements.get("view-transition-group-children" /* Protocol.DOM.PseudoType.ViewTransitionGroupChildren */) || [],
            ...this.#pseudoElements.get("view-transition-image-pair" /* Protocol.DOM.PseudoType.ViewTransitionImagePair */) || [],
            ...this.#pseudoElements.get("view-transition-old" /* Protocol.DOM.PseudoType.ViewTransitionOld */) || [],
            ...this.#pseudoElements.get("view-transition-new" /* Protocol.DOM.PseudoType.ViewTransitionNew */) || [],
        ];
    }
    carouselPseudoElements() {
        return [
            ...this.#pseudoElements.get("scroll-button" /* Protocol.DOM.PseudoType.ScrollButton */) || [],
            ...this.#pseudoElements.get("column" /* Protocol.DOM.PseudoType.Column */) || [],
            ...this.#pseudoElements.get("scroll-marker" /* Protocol.DOM.PseudoType.ScrollMarker */) || [],
            ...this.#pseudoElements.get("scroll-marker-group" /* Protocol.DOM.PseudoType.ScrollMarkerGroup */) || [],
        ];
    }
    hasAssignedSlot() {
        return this.assignedSlot !== null;
    }
    isInsertionPoint() {
        return !this.isXMLNode() &&
            (this.#nodeName === 'SHADOW' || this.#nodeName === 'CONTENT' || this.#nodeName === 'SLOT');
    }
    distributedNodes() {
        return this.#distributedNodes;
    }
    isInShadowTree() {
        return this.#isInShadowTree;
    }
    getTreeRoot() {
        return this.isShadowRoot() ? this : (this.ancestorShadowRoot() ?? this.ownerDocument ?? this);
    }
    ancestorShadowHost() {
        const ancestorShadowRoot = this.ancestorShadowRoot();
        return ancestorShadowRoot ? ancestorShadowRoot.parentNode : null;
    }
    ancestorShadowRoot() {
        if (!this.#isInShadowTree) {
            return null;
        }
        let current = this;
        while (current && !current.isShadowRoot()) {
            current = current.parentNode;
        }
        return current;
    }
    ancestorUserAgentShadowRoot() {
        const ancestorShadowRoot = this.ancestorShadowRoot();
        if (!ancestorShadowRoot) {
            return null;
        }
        return ancestorShadowRoot.shadowRootType() === DOMNode.ShadowRootTypes.UserAgent ? ancestorShadowRoot : null;
    }
    isShadowRoot() {
        return Boolean(this.#shadowRootType);
    }
    shadowRootType() {
        return this.#shadowRootType || null;
    }
    nodeNameInCorrectCase() {
        const shadowRootType = this.shadowRootType();
        if (shadowRootType) {
            return '#shadow-root (' + shadowRootType + ')';
        }
        // If there is no local #name, it's case sensitive
        if (!this.localName()) {
            return this.nodeName();
        }
        // If the names are different lengths, there is a prefix and it's case sensitive
        if (this.localName().length !== this.nodeName().length) {
            return this.nodeName();
        }
        // Return the localname, which will be case insensitive if its an html node
        return this.localName();
    }
    setNodeName(name, callback) {
        void this.#agent.invoke_setNodeName({ nodeId: this.id, name }).then(response => {
            if (!response.getError()) {
                this.#domModel.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null, this.#domModel.nodeForId(response.nodeId));
            }
        });
    }
    localName() {
        return this.#localName;
    }
    nodeValue() {
        return this.nodeValueInternal;
    }
    setNodeValueInternal(nodeValue) {
        this.nodeValueInternal = nodeValue;
    }
    setNodeValue(value, callback) {
        void this.#agent.invoke_setNodeValue({ nodeId: this.id, value }).then(response => {
            if (!response.getError()) {
                this.#domModel.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    getAttribute(name) {
        const attr = this.#attributes.get(name);
        return attr ? attr.value : undefined;
    }
    setAttribute(name, text, callback) {
        void this.#agent.invoke_setAttributesAsText({ nodeId: this.id, text, name }).then(response => {
            if (!response.getError()) {
                this.#domModel.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    setAttributeValue(name, value, callback) {
        void this.#agent.invoke_setAttributeValue({ nodeId: this.id, name, value }).then(response => {
            if (!response.getError()) {
                this.#domModel.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    setAttributeValuePromise(name, value) {
        return new Promise(fulfill => this.setAttributeValue(name, value, fulfill));
    }
    attributes() {
        return [...this.#attributes.values()];
    }
    async removeAttribute(name) {
        const response = await this.#agent.invoke_removeAttribute({ nodeId: this.id, name });
        if (response.getError()) {
            return;
        }
        this.#attributes.delete(name);
        this.#domModel.markUndoableState();
    }
    getChildNodesPromise() {
        return new Promise(resolve => {
            return this.getChildNodes(childNodes => resolve(childNodes));
        });
    }
    getChildNodes(callback) {
        if (this.childrenInternal) {
            callback(this.children());
            return;
        }
        void this.#agent.invoke_requestChildNodes({ nodeId: this.id }).then(response => {
            callback(response.getError() ? null : this.children());
        });
    }
    async getSubtree(depth, pierce) {
        console.assert(depth > 0, 'Do not fetch an infinite subtree to avoid crashing the renderer for large documents');
        const response = await this.#agent.invoke_requestChildNodes({ nodeId: this.id, depth, pierce });
        return response.getError() ? null : this.childrenInternal;
    }
    async getOuterHTML(includeShadowDOM = false) {
        const { outerHTML } = await this.#agent.invoke_getOuterHTML({ nodeId: this.id, includeShadowDOM });
        return outerHTML;
    }
    setOuterHTML(html, callback) {
        void this.#agent.invoke_setOuterHTML({ nodeId: this.id, outerHTML: html }).then(response => {
            if (!response.getError()) {
                this.#domModel.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    removeNode(callback) {
        return this.#agent.invoke_removeNode({ nodeId: this.id }).then(response => {
            if (!response.getError()) {
                this.#domModel.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    path() {
        function getNodeKey(node) {
            if (!node.#nodeName.length) {
                return null;
            }
            if (node.index !== undefined) {
                return node.index;
            }
            if (!node.parentNode) {
                return null;
            }
            if (node.isShadowRoot()) {
                return node.shadowRootType() === DOMNode.ShadowRootTypes.UserAgent ? 'u' : 'a';
            }
            if (node.nodeType() === 9 /* NodeType.DOCUMENT_NODE */) {
                return 'd';
            }
            return null;
        }
        const path = [];
        let node = this;
        while (node) {
            const key = getNodeKey(node);
            if (key === null) {
                break;
            }
            path.push([key, node.#nodeName]);
            node = node.parentNode;
        }
        path.reverse();
        return path.join(',');
    }
    isAncestor(node) {
        if (!node) {
            return false;
        }
        let currentNode = node.parentNode;
        while (currentNode) {
            if (this === currentNode) {
                return true;
            }
            currentNode = currentNode.parentNode;
        }
        return false;
    }
    isDescendant(descendant) {
        return descendant.isAncestor(this);
    }
    frameOwnerFrameId() {
        return this.#frameOwnerFrameId;
    }
    frameId() {
        let node = this.parentNode || this;
        while (!node.#frameOwnerFrameId && node.parentNode) {
            node = node.parentNode;
        }
        return node.#frameOwnerFrameId;
    }
    setAttributesPayload(attrs) {
        let attributesChanged = !this.#attributes || attrs.length !== this.#attributes.size * 2;
        const oldAttributesMap = this.#attributes || new Map();
        this.#attributes = new Map();
        for (let i = 0; i < attrs.length; i += 2) {
            const name = attrs[i];
            const value = attrs[i + 1];
            this.addAttribute(name, value);
            if (attributesChanged) {
                continue;
            }
            const oldAttribute = oldAttributesMap.get(name);
            if (oldAttribute?.value !== value) {
                attributesChanged = true;
            }
        }
        return attributesChanged;
    }
    insertChild(prev, payload) {
        if (!this.childrenInternal) {
            throw new Error('DOMNode._children is expected to not be null.');
        }
        const node = DOMNode.create(this.#domModel, this.ownerDocument, this.#isInShadowTree, payload, this.#retainedNodes);
        this.childrenInternal.splice(prev ? this.childrenInternal.indexOf(prev) + 1 : 0, 0, node);
        this.renumber();
        return node;
    }
    removeChild(node) {
        const pseudoType = node.pseudoType();
        if (pseudoType) {
            const updatedPseudoElements = this.#pseudoElements.get(pseudoType)?.filter(element => element !== node);
            if (updatedPseudoElements && updatedPseudoElements.length > 0) {
                this.#pseudoElements.set(pseudoType, updatedPseudoElements);
            }
            else {
                this.#pseudoElements.delete(pseudoType);
            }
        }
        else {
            const shadowRootIndex = this.shadowRootsInternal.indexOf(node);
            if (shadowRootIndex !== -1) {
                this.shadowRootsInternal.splice(shadowRootIndex, 1);
            }
            else {
                if (!this.childrenInternal) {
                    throw new Error('DOMNode._children is expected to not be null.');
                }
                if (this.childrenInternal.indexOf(node) === -1) {
                    throw new Error('DOMNode._children is expected to contain the node to be removed.');
                }
                this.childrenInternal.splice(this.childrenInternal.indexOf(node), 1);
            }
        }
        node.parentNode = null;
        this.#subtreeMarkerCount -= node.#subtreeMarkerCount;
        if (node.#subtreeMarkerCount) {
            this.#domModel.dispatchEventToListeners(Events.MarkersChanged, this);
        }
        this.renumber();
    }
    setChildrenPayload(payloads) {
        this.childrenInternal = [];
        for (let i = 0; i < payloads.length; ++i) {
            const payload = payloads[i];
            const node = DOMNode.create(this.#domModel, this.ownerDocument, this.#isInShadowTree, payload, this.#retainedNodes);
            this.childrenInternal.push(node);
        }
        this.renumber();
    }
    setPseudoElements(payloads) {
        if (!payloads) {
            return;
        }
        for (let i = 0; i < payloads.length; ++i) {
            const node = DOMNode.create(this.#domModel, this.ownerDocument, this.#isInShadowTree, payloads[i], this.#retainedNodes);
            node.parentNode = this;
            const pseudoType = node.pseudoType();
            if (!pseudoType) {
                throw new Error('DOMNode.pseudoType() is expected to be defined.');
            }
            const currentPseudoElements = this.#pseudoElements.get(pseudoType);
            if (currentPseudoElements) {
                currentPseudoElements.push(node);
            }
            else {
                this.#pseudoElements.set(pseudoType, [node]);
            }
        }
    }
    toAdoptedStyleSheets(ids) {
        return ids.map(id => (new AdoptedStyleSheet(id, this)));
    }
    setAdoptedStyleSheets(ids) {
        this.#adoptedStyleSheets = this.toAdoptedStyleSheets(ids);
        this.#domModel.dispatchEventToListeners(Events.AdoptedStyleSheetsModified, this);
    }
    get adoptedStyleSheetsForNode() {
        return this.#adoptedStyleSheets;
    }
    setDistributedNodePayloads(payloads) {
        this.#distributedNodes = [];
        for (const payload of payloads) {
            this.#distributedNodes.push(new DOMNodeShortcut(this.#domModel.target(), payload.backendNodeId, payload.nodeType, payload.nodeName));
        }
    }
    setAssignedSlot(payload) {
        this.assignedSlot =
            new DOMNodeShortcut(this.#domModel.target(), payload.backendNodeId, payload.nodeType, payload.nodeName);
    }
    renumber() {
        if (!this.childrenInternal) {
            throw new Error('DOMNode._children is expected to not be null.');
        }
        this.childNodeCountInternal = this.childrenInternal.length;
        if (this.childNodeCountInternal === 0) {
            this.firstChild = null;
            this.lastChild = null;
            return;
        }
        this.firstChild = this.childrenInternal[0];
        this.lastChild = this.childrenInternal[this.childNodeCountInternal - 1];
        for (let i = 0; i < this.childNodeCountInternal; ++i) {
            const child = this.childrenInternal[i];
            child.index = i;
            child.nextSibling = i + 1 < this.childNodeCountInternal ? this.childrenInternal[i + 1] : null;
            child.previousSibling = i - 1 >= 0 ? this.childrenInternal[i - 1] : null;
            child.parentNode = this;
        }
    }
    addAttribute(name, value) {
        const attr = { name, value, _node: this };
        this.#attributes.set(name, attr);
    }
    setAttributeInternal(name, value) {
        const attr = this.#attributes.get(name);
        if (attr) {
            attr.value = value;
        }
        else {
            this.addAttribute(name, value);
        }
    }
    removeAttributeInternal(name) {
        this.#attributes.delete(name);
    }
    copyTo(targetNode, anchorNode, callback) {
        void this.#agent
            .invoke_copyTo({ nodeId: this.id, targetNodeId: targetNode.id, insertBeforeNodeId: anchorNode ? anchorNode.id : undefined })
            .then(response => {
            if (!response.getError()) {
                this.#domModel.markUndoableState();
            }
            const pastedNode = this.#domModel.nodeForId(response.nodeId);
            if (pastedNode) {
                // For every marker in this.#markers, set a marker in the copied node.
                for (const [name, value] of this.#markers) {
                    pastedNode.setMarker(name, value);
                }
            }
            if (callback) {
                callback(response.getError() || null, pastedNode);
            }
        });
    }
    moveTo(targetNode, anchorNode, callback) {
        void this.#agent
            .invoke_moveTo({ nodeId: this.id, targetNodeId: targetNode.id, insertBeforeNodeId: anchorNode ? anchorNode.id : undefined })
            .then(response => {
            if (!response.getError()) {
                this.#domModel.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null, this.#domModel.nodeForId(response.nodeId));
            }
        });
    }
    async duplicate() {
        if (this.isInShadowTree()) {
            return { error: 'Cannot duplicate node in shadow tree', node: null };
        }
        const parentNode = this.parentNode ? this.parentNode : this;
        if (parentNode.nodeName() === '#document') {
            return { error: 'Parent node is document', node: null };
        }
        return await new Promise(resolve => {
            this.copyTo(parentNode, this.nextSibling, (error, node) => resolve({ error, node }));
        });
    }
    /**
     * Runs a script on the node's remote object that toggles a class name on
     * the node and injects a stylesheet into the head of the node's document
     * containing a rule to set "visibility: hidden" on the class and all it's
     * ancestors.
     */
    async toggleHideElement() {
        let pseudoElementName = this.pseudoType() ? this.nodeName() : null;
        const pseudoIdentifier = this.pseudoIdentifier();
        if (pseudoElementName && pseudoIdentifier) {
            pseudoElementName += `(${cssEscape(pseudoIdentifier)})`;
        }
        let effectiveNode = this;
        while (effectiveNode?.pseudoType()) {
            if (effectiveNode !== this && effectiveNode.pseudoType() === 'column') {
                // Ideally we would select the specific column pseudo element, but
                // we don't have a way to do that at the moment.
                pseudoElementName = '::column' + pseudoElementName;
            }
            effectiveNode = effectiveNode.parentNode;
        }
        if (!effectiveNode) {
            return;
        }
        const hidden = this.marker('hidden-marker');
        const object = await effectiveNode.resolveToObject('');
        if (!object) {
            return;
        }
        await object.callFunction(toggleClassAndInjectStyleRule, [{ value: pseudoElementName }, { value: !hidden }]);
        object.release();
        this.setMarker('hidden-marker', hidden ? null : true);
    }
    isToggledToHidden() {
        return Boolean(this.marker('hidden-marker'));
    }
    isXMLNode() {
        return Boolean(this.#xmlVersion);
    }
    isCustomElement() {
        if (this.nodeType() !== 1 /* NodeType.ELEMENT_NODE */ || this.isXMLNode() || Boolean(this.pseudoType())) {
            return false;
        }
        const localName = this.localName() || this.nodeName().toLowerCase();
        if (localName.includes('-')) {
            const builtInExclusionList = [
                'annotation-xml',
                'color-profile',
                'font-face',
                'font-face-src',
                'font-face-uri',
                'font-face-format',
                'font-face-name',
                'missing-glyph',
            ];
            return !builtInExclusionList.includes(localName);
        }
        return this.getAttribute('is') !== undefined;
    }
    setMarker(name, value) {
        if (value === null) {
            if (!this.#markers.has(name)) {
                return;
            }
            this.#markers.delete(name);
            for (let node = this; node; node = node.parentNode) {
                --node.#subtreeMarkerCount;
            }
            for (let node = this; node; node = node.parentNode) {
                this.#domModel.dispatchEventToListeners(Events.MarkersChanged, node);
            }
            return;
        }
        if (this.parentNode && !this.#markers.has(name)) {
            for (let node = this; node; node = node.parentNode) {
                ++node.#subtreeMarkerCount;
            }
        }
        this.#markers.set(name, value);
        for (let node = this; node; node = node.parentNode) {
            this.#domModel.dispatchEventToListeners(Events.MarkersChanged, node);
        }
    }
    marker(name) {
        return this.#markers.get(name) ?? null;
    }
    getMarkerKeysForTest() {
        return [...this.#markers.keys()];
    }
    traverseMarkers(visitor) {
        function traverse(node) {
            if (!node.#subtreeMarkerCount) {
                return;
            }
            for (const marker of node.#markers.keys()) {
                visitor(node, marker);
            }
            if (!node.childrenInternal) {
                return;
            }
            for (const child of node.childrenInternal) {
                traverse(child);
            }
        }
        traverse(this);
    }
    resolveURL(url) {
        if (!url) {
            return url;
        }
        for (let frameOwnerCandidate = this; frameOwnerCandidate; frameOwnerCandidate = frameOwnerCandidate.parentNode) {
            if (frameOwnerCandidate instanceof DOMDocument && frameOwnerCandidate.baseURL) {
                return Common.ParsedURL.ParsedURL.completeURL(frameOwnerCandidate.baseURL, url);
            }
        }
        return null;
    }
    highlight(mode) {
        this.#domModel.overlayModel().highlightInOverlay({ node: this }, mode);
    }
    highlightForTwoSeconds() {
        this.#domModel.overlayModel().highlightInOverlayForTwoSeconds({ node: this });
    }
    async resolveToObject(objectGroup, executionContextId) {
        const { object } = await this.#agent.invoke_resolveNode({
            nodeId: this.id,
            executionContextId,
            objectGroup,
        });
        return object && this.#domModel.runtimeModelInternal.createRemoteObject(object) || null;
    }
    async boxModel() {
        const { model } = await this.#agent.invoke_getBoxModel({ nodeId: this.id });
        return model;
    }
    canInspectNode() {
        if (this.ancestorUserAgentShadowRoot()) {
            return false;
        }
        if (this.#pseudoType) {
            return [
                "before" /* Protocol.DOM.PseudoType.Before */,
                "after" /* Protocol.DOM.PseudoType.After */,
                "marker" /* Protocol.DOM.PseudoType.Marker */,
                "scroll-marker" /* Protocol.DOM.PseudoType.ScrollMarker */,
                "backdrop" /* Protocol.DOM.PseudoType.Backdrop */,
                "view-transition" /* Protocol.DOM.PseudoType.ViewTransition */,
                "view-transition-group" /* Protocol.DOM.PseudoType.ViewTransitionGroup */,
                "view-transition-image-pair" /* Protocol.DOM.PseudoType.ViewTransitionImagePair */,
                "view-transition-old" /* Protocol.DOM.PseudoType.ViewTransitionOld */,
                "view-transition-new" /* Protocol.DOM.PseudoType.ViewTransitionNew */,
            ].includes(this.#pseudoType);
        }
        return true;
    }
    async setAsInspectedNode() {
        if (!this.canInspectNode()) {
            return;
        }
        await this.#agent.invoke_setInspectedNode({ nodeId: this.id });
    }
    enclosingElementOrSelf() {
        let node = this;
        if (node && node.nodeType() === 3 /* NodeType.TEXT_NODE */ && node.parentNode) {
            node = node.parentNode;
        }
        if (node && node.nodeType() !== 1 /* NodeType.ELEMENT_NODE */) {
            node = null;
        }
        return node;
    }
    async callFunction(fn, args = []) {
        const object = await this.resolveToObject();
        if (!object) {
            return null;
        }
        const result = await object.callFunction(fn, args.map(arg => RemoteObject.toCallArgument(arg)));
        object.release();
        if (result.wasThrown || !result.object) {
            return null;
        }
        return {
            value: result.object.value,
        };
    }
    async saveNodeToTempVariable() {
        const remoteObjectForConsole = await this.resolveToObject();
        const consoleModel = this.#domModel.target().model(ConsoleModel);
        await consoleModel?.saveToTempVariable(remoteObjectForConsole?.runtimeModel().defaultExecutionContext() ?? null, remoteObjectForConsole);
    }
    async scrollIntoView() {
        const node = this.enclosingElementOrSelf();
        if (!node) {
            return;
        }
        // Highlight synchronously before scrolling to avoid out-of-order highlights
        // if asynchronous scroll calls resolve late during rapid navigation.
        node.highlightForTwoSeconds();
        await node.callFunction(scrollIntoViewInPage);
    }
    async focus() {
        const node = this.enclosingElementOrSelf();
        if (!node) {
            throw new Error('DOMNode.focus expects node to not be null.');
        }
        const result = await node.callFunction(focusInPage);
        if (!result) {
            return;
        }
        node.highlightForTwoSeconds();
        await this.#domModel.target().pageAgent().invoke_bringToFront();
    }
    simpleSelector() {
        const lowerCaseName = this.localName() || this.nodeName().toLowerCase();
        if (this.nodeType() !== 1 /* NodeType.ELEMENT_NODE */) {
            return lowerCaseName;
        }
        const type = this.getAttribute('type');
        const id = this.getAttribute('id');
        const classes = this.getAttribute('class');
        if (lowerCaseName === 'input' && type && !id && !classes) {
            return lowerCaseName + '[type="' + cssEscape(type) + '"]';
        }
        if (id) {
            return lowerCaseName + '#' + cssEscape(id);
        }
        if (classes) {
            const classList = classes.trim().split(/\s+/g);
            return (lowerCaseName === 'div' ? '' : lowerCaseName) + '.' + classList.map(cls => cssEscape(cls)).join('.');
        }
        const pseudoIdentifier = this.pseudoIdentifier();
        if (pseudoIdentifier) {
            return `${lowerCaseName}(${cssEscape(pseudoIdentifier)})`;
        }
        return lowerCaseName;
    }
    async getAnchorBySpecifier(specifier) {
        const response = await this.#agent.invoke_getAnchorElement({
            nodeId: this.id,
            anchorSpecifier: specifier,
        });
        if (response.getError()) {
            return null;
        }
        return this.domModel().nodeForId(response.nodeId);
    }
    async getImplicitAnchorCandidates() {
        const response = await this.#agent.invoke_getImplicitAnchorCandidates({
            nodeId: this.id,
        });
        if (response.getError() || !response.backendNodeIds) {
            return [];
        }
        const target = this.domModel().target();
        return response.backendNodeIds.map(backendNodeId => new DeferredDOMNode(target, backendNodeId));
    }
    async takeSnapshot(ownerDocumentSnapshot) {
        let snapshot;
        if (this instanceof DOMDocument) {
            const doc = this;
            snapshot = new DOMDocumentSnapshot(this.domModel(), {
                nodeId: this.id,
                backendNodeId: this.backendNodeId(),
                nodeType: this.nodeType(),
                nodeName: this.nodeName(),
                localName: this.localName(),
                nodeValue: this.nodeValueInternal,
                documentURL: this.documentURL,
                baseURL: this.baseURL,
            }, this.frameId(), doc.securityOrigin());
        }
        else {
            snapshot = new DOMNodeSnapshot(this.domModel());
        }
        snapshot.id = this.id;
        snapshot.#backendNodeId = this.#backendNodeId;
        snapshot.#frameOwnerFrameId = this.#frameOwnerFrameId;
        snapshot.#nodeType = this.#nodeType;
        snapshot.#nodeName = this.#nodeName;
        snapshot.#localName = this.#localName;
        snapshot.nodeValueInternal = this.nodeValueInternal;
        snapshot.#pseudoType = this.#pseudoType;
        snapshot.#pseudoIdentifier = this.#pseudoIdentifier;
        snapshot.#shadowRootType = this.#shadowRootType;
        snapshot.#xmlVersion = this.#xmlVersion;
        snapshot.#isSVGNode = this.#isSVGNode;
        snapshot.#isScrollable = this.#isScrollable;
        snapshot.#affectedByStartingStyles = this.#affectedByStartingStyles;
        snapshot.ownerDocument =
            ownerDocumentSnapshot || ((snapshot instanceof DOMDocument) ? snapshot : this.ownerDocument);
        snapshot.#isInShadowTree = this.#isInShadowTree;
        snapshot.childNodeCountInternal = this.childNodeCountInternal;
        if (!this.childrenInternal && this.childNodeCountInternal > 0) {
            await this.getSubtree(1, false);
        }
        for (const [name, attr] of this.#attributes) {
            snapshot.#attributes.set(name, { name: attr.name, value: attr.value, _node: snapshot });
        }
        if (this.childrenInternal) {
            snapshot.childrenInternal = [];
            for (const child of this.childrenInternal) {
                const childSnapshot = await child.takeSnapshot(snapshot.ownerDocument || undefined);
                childSnapshot.parentNode = snapshot;
                childSnapshot.ownerDocument = (snapshot instanceof DOMDocument) ? snapshot : snapshot.ownerDocument;
                snapshot.childrenInternal.push(childSnapshot);
                if (childSnapshot.ownerDocument instanceof DOMDocument) {
                    if (childSnapshot.nodeName() === 'HTML' && !childSnapshot.ownerDocument.documentElement) {
                        childSnapshot.ownerDocument.documentElement = childSnapshot;
                    }
                    if (childSnapshot.nodeName() === 'BODY' && !childSnapshot.ownerDocument.body) {
                        childSnapshot.ownerDocument.body = childSnapshot;
                    }
                }
            }
        }
        for (const root of this.shadowRootsInternal) {
            const rootSnapshot = await root.takeSnapshot(snapshot.ownerDocument || undefined);
            rootSnapshot.parentNode = snapshot;
            rootSnapshot.ownerDocument = snapshot.ownerDocument;
            snapshot.shadowRootsInternal.push(rootSnapshot);
        }
        if (this.templateContentInternal) {
            const templateSnapshot = await this.templateContentInternal.takeSnapshot(snapshot.ownerDocument || undefined);
            templateSnapshot.parentNode = snapshot;
            templateSnapshot.ownerDocument = snapshot.ownerDocument;
            snapshot.templateContentInternal = templateSnapshot;
        }
        if (this.contentDocumentInternal) {
            const contentDocSnapshot = await this.contentDocumentInternal.takeSnapshot();
            contentDocSnapshot.parentNode = snapshot;
            snapshot.contentDocumentInternal = contentDocSnapshot;
        }
        if (this.#importedDocument) {
            const importedDocSnapshot = await this.#importedDocument.takeSnapshot(snapshot.ownerDocument || undefined);
            importedDocSnapshot.parentNode = snapshot;
            importedDocSnapshot.ownerDocument = snapshot.ownerDocument;
            snapshot.#importedDocument = importedDocSnapshot;
        }
        for (const [pseudoType, nodes] of this.#pseudoElements) {
            const snapshots = [];
            for (const node of nodes) {
                const pseudoSnapshot = await node.takeSnapshot(snapshot.ownerDocument || undefined);
                pseudoSnapshot.parentNode = snapshot;
                pseudoSnapshot.ownerDocument = snapshot.ownerDocument;
                snapshots.push(pseudoSnapshot);
            }
            snapshot.#pseudoElements.set(pseudoType, snapshots);
        }
        // We intentionally preserve references to live nodes for assignedSlot and distributedNodes.
        // This allows slot adorners in the Elements panel to remain functional within the snapshot,
        // enabling users to resolve and jump to the actual nodes in the live DOM tree.
        if (this.#distributedNodes) {
            snapshot.#distributedNodes = [...this.#distributedNodes];
        }
        snapshot.assignedSlot = this.assignedSlot;
        snapshot.#retainedNodes = this.#retainedNodes;
        if (this.#adoptedStyleSheets.length) {
            snapshot.setAdoptedStyleSheets(this.#adoptedStyleSheets.map(sheet => sheet.id));
        }
        return snapshot;
    }
    classNames() {
        const classes = this.getAttribute('class');
        return classes ? classes.split(/\s+/) : [];
    }
}
(function (DOMNode) {
    let ShadowRootTypes;
    (function (ShadowRootTypes) {
        /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
        ShadowRootTypes["UserAgent"] = "user-agent";
        ShadowRootTypes["Open"] = "open";
        ShadowRootTypes["Closed"] = "closed";
        /* eslint-enable @typescript-eslint/naming-convention */
    })(ShadowRootTypes = DOMNode.ShadowRootTypes || (DOMNode.ShadowRootTypes = {}));
})(DOMNode || (DOMNode = {}));
export class DeferredDOMNode {
    #domModelInternal;
    #backendNodeIdInternal;
    constructor(target, backendNodeId) {
        this.#domModelInternal = target.model(DOMModel);
        this.#backendNodeIdInternal = backendNodeId;
    }
    resolve(callback) {
        void this.resolvePromise().then(callback);
    }
    async resolvePromise() {
        const nodeIds = await this.#domModelInternal.pushNodesByBackendIdsToFrontend(new Set([this.#backendNodeIdInternal]));
        return nodeIds?.get(this.#backendNodeIdInternal) || null;
    }
    backendNodeId() {
        return this.#backendNodeIdInternal;
    }
    domModel() {
        return this.#domModelInternal;
    }
    highlight() {
        this.#domModelInternal.overlayModel().highlightInOverlay({ deferredNode: this, selectorList: undefined });
    }
}
export class DOMNodeShortcut {
    nodeType;
    nodeName;
    deferredNode;
    // Shortctus to elements that children of the element this shortcut is for.
    // Currently, use for backdrop elements in the top layer.«
    childShortcuts = [];
    constructor(target, backendNodeId, nodeType, nodeName, childShortcuts = []) {
        this.nodeType = nodeType;
        this.nodeName = nodeName;
        this.deferredNode = new DeferredDOMNode(target, backendNodeId);
        this.childShortcuts = childShortcuts;
    }
}
export class DOMDocument extends DOMNode {
    body;
    documentElement;
    #documentURL;
    #baseURL;
    #frameId;
    #securityOrigin;
    constructor(domModel, payload, frameId) {
        super(domModel);
        this.body = null;
        this.documentElement = null;
        this.init(this, false, payload);
        this.#documentURL = (payload.documentURL || '');
        this.#baseURL = (payload.baseURL || '');
        this.#frameId = frameId ?? null;
        const resourceTreeModel = this.domModel().target().model(ResourceTreeModel);
        const frame = this.#frameId ? resourceTreeModel?.frameForId(this.#frameId) : null;
        if (frame) {
            this.#securityOrigin = frame.securityOrigin();
        }
        else if (resourceTreeModel?.mainFrame) {
            // If the target has an active frame tree, a DOMDocument without a matching
            // frame is a detached document and must be isolated with an opaque origin.
            this.#securityOrigin = SecurityOrigin.createUniqueOpaque();
        }
        else {
            // TODO(b/567434846): Migrate synthetic unit tests to attach frames so this
            // fallback to parsing documentURL can be removed.
            this.#securityOrigin = SecurityOrigin.create(this.#documentURL);
        }
    }
    get documentURL() {
        return this.#documentURL;
    }
    get baseURL() {
        return this.#baseURL;
    }
    frameId() {
        return this.#frameId;
    }
    /**
     * Returns the security origin of this document.
     *
     * The security origin is resolved from the document's frame and is recomputed
     * when the document navigates to a new URL via `setDocumentURL`.
     */
    securityOrigin() {
        return this.#securityOrigin;
    }
    /**
     * Updates the document and base URLs, and updates the document's security origin.
     */
    setDocumentURL(url, securityOrigin) {
        this.#documentURL = url;
        this.#baseURL = url;
        // Prefer the canonical security origin from the frame, falling back to creating
        // an origin from the URL as a last resort for test environments.
        this.#securityOrigin = securityOrigin ?? SecurityOrigin.create(url);
    }
}
export class AdoptedStyleSheet {
    id;
    parent;
    constructor(id, parent) {
        this.id = id;
        this.parent = parent;
    }
    get cssModel() {
        return this.parent.domModel().cssModel();
    }
}
export class DOMModel extends SDKModel {
    agent;
    idToDOMNode = new Map();
    frameIdToOwnerNode = new Map();
    #document = null;
    #attributeLoadNodeIds = new Set();
    runtimeModelInternal;
    #lastMutationId;
    #pendingDocumentRequestPromise = null;
    #frameOwnerNode;
    #loadNodeAttributesTimeout;
    #searchId;
    #topLayerThrottler = new Common.Throttler.Throttler(100);
    #topLayerNodes = [];
    #resourceTreeModel = null;
    constructor(target) {
        super(target);
        this.agent = target.domAgent();
        target.registerDOMDispatcher(new DOMDispatcher(this));
        this.runtimeModelInternal = target.model(RuntimeModel);
        this.#resourceTreeModel = target.model(ResourceTreeModel);
        this.#resourceTreeModel?.addEventListener(ResourceTreeModelEvents.DocumentOpened, this.onDocumentOpened, this);
        if (!target.suspended()) {
            void this.agent.invoke_enable({});
        }
    }
    runtimeModel() {
        return this.runtimeModelInternal;
    }
    cssModel() {
        return this.target().model(CSSModel);
    }
    overlayModel() {
        return this.target().model(OverlayModel);
    }
    static cancelSearch(targetManager) {
        for (const domModel of targetManager.models(DOMModel)) {
            domModel.cancelSearch();
        }
    }
    scheduleMutationEvent(node) {
        if (!this.hasEventListeners(Events.DOMMutated)) {
            return;
        }
        this.#lastMutationId = (this.#lastMutationId || 0) + 1;
        void Promise.resolve().then(callObserve.bind(this, node, this.#lastMutationId));
        function callObserve(node, mutationId) {
            if (!this.hasEventListeners(Events.DOMMutated) || this.#lastMutationId !== mutationId) {
                return;
            }
            this.dispatchEventToListeners(Events.DOMMutated, node);
        }
    }
    onDocumentOpened(event) {
        const frame = event.data;
        const node = this.frameIdToOwnerNode.get(frame.id);
        if (node) {
            const contentDocument = node.contentDocument();
            if (contentDocument && contentDocument.documentURL !== frame.url) {
                contentDocument.setDocumentURL(frame.url, frame.securityOrigin());
                this.dispatchEventToListeners(Events.DocumentURLChanged, contentDocument);
            }
        }
    }
    requestDocument() {
        if (this.#document) {
            return Promise.resolve(this.#document);
        }
        if (!this.#pendingDocumentRequestPromise) {
            this.#pendingDocumentRequestPromise = this.requestDocumentInternal();
        }
        return this.#pendingDocumentRequestPromise;
    }
    async getOwnerNodeForFrame(frameId) {
        // Returns an error if the frameId does not belong to the current target.
        const response = await this.agent.invoke_getFrameOwner({ frameId });
        if (response.getError()) {
            return null;
        }
        return new DeferredDOMNode(this.target(), response.backendNodeId);
    }
    async requestDocumentInternal() {
        const response = await this.agent.invoke_getDocument({});
        if (response.getError()) {
            return null;
        }
        const { root: documentPayload } = response;
        this.#pendingDocumentRequestPromise = null;
        if (documentPayload) {
            this.setDocument(documentPayload);
        }
        if (!this.#document) {
            console.error('No document');
            return null;
        }
        const parentModel = this.parentModel();
        if (parentModel && !this.#frameOwnerNode) {
            await parentModel.requestDocument();
            const mainFrame = this.target().model(ResourceTreeModel)?.mainFrame;
            if (mainFrame) {
                const response = await parentModel.agent.invoke_getFrameOwner({ frameId: mainFrame.id });
                if (!response.getError() && response.nodeId) {
                    this.#frameOwnerNode = parentModel.nodeForId(response.nodeId);
                }
            }
        }
        // Document could have been cleared by now.
        if (this.#frameOwnerNode) {
            const oldDocument = this.#frameOwnerNode.contentDocument();
            this.#frameOwnerNode.setContentDocument(this.#document);
            this.#frameOwnerNode.setChildren([]);
            if (this.#document) {
                this.#document.parentNode = this.#frameOwnerNode;
                this.dispatchEventToListeners(Events.NodeInserted, this.#document);
            }
            else if (oldDocument) {
                this.dispatchEventToListeners(Events.NodeRemoved, { node: oldDocument, parent: this.#frameOwnerNode });
            }
        }
        return this.#document;
    }
    existingDocument() {
        return this.#document;
    }
    async pushNodeToFrontend(objectId) {
        await this.requestDocument();
        const { nodeId } = await this.agent.invoke_requestNode({ objectId });
        return this.nodeForId(nodeId);
    }
    pushNodeByPathToFrontend(path) {
        return this.requestDocument()
            .then(() => this.agent.invoke_pushNodeByPathToFrontend({ path }))
            .then(({ nodeId }) => nodeId);
    }
    async pushNodesByBackendIdsToFrontend(backendNodeIds) {
        await this.requestDocument();
        const backendNodeIdsArray = [...backendNodeIds];
        const { nodeIds } = await this.agent.invoke_pushNodesByBackendIdsToFrontend({ backendNodeIds: backendNodeIdsArray });
        if (!nodeIds) {
            return null;
        }
        const map = new Map();
        for (let i = 0; i < nodeIds.length; ++i) {
            if (nodeIds[i]) {
                map.set(backendNodeIdsArray[i], this.nodeForId(nodeIds[i]));
            }
        }
        return map;
    }
    attributeModified(nodeId, name, value) {
        const node = this.idToDOMNode.get(nodeId);
        if (!node) {
            return;
        }
        node.setAttributeInternal(name, value);
        this.dispatchEventToListeners(Events.AttrModified, { node, name });
        this.scheduleMutationEvent(node);
    }
    attributeRemoved(nodeId, name) {
        const node = this.idToDOMNode.get(nodeId);
        if (!node) {
            return;
        }
        node.removeAttributeInternal(name);
        this.dispatchEventToListeners(Events.AttrRemoved, { node, name });
        this.scheduleMutationEvent(node);
    }
    inlineStyleInvalidated(nodeIds) {
        nodeIds.forEach(nodeId => this.#attributeLoadNodeIds.add(nodeId));
        if (!this.#loadNodeAttributesTimeout) {
            this.#loadNodeAttributesTimeout = globalThis.setTimeout(this.loadNodeAttributes.bind(this), 20);
        }
    }
    loadNodeAttributes() {
        this.#loadNodeAttributesTimeout = undefined;
        for (const nodeId of this.#attributeLoadNodeIds) {
            void this.agent.invoke_getAttributes({ nodeId }).then(({ attributes }) => {
                if (!attributes) {
                    // We are calling loadNodeAttributes asynchronously, it is ok if node is not found.
                    return;
                }
                const node = this.idToDOMNode.get(nodeId);
                if (!node) {
                    return;
                }
                if (node.setAttributesPayload(attributes)) {
                    this.dispatchEventToListeners(Events.AttrModified, { node, name: 'style' });
                    this.scheduleMutationEvent(node);
                }
            });
        }
        this.#attributeLoadNodeIds.clear();
    }
    characterDataModified(nodeId, newValue) {
        const node = this.idToDOMNode.get(nodeId);
        if (!node) {
            console.error('nodeId could not be resolved to a node');
            return;
        }
        node.setNodeValueInternal(newValue);
        this.dispatchEventToListeners(Events.CharacterDataModified, node);
        this.scheduleMutationEvent(node);
    }
    nodeForId(nodeId) {
        return nodeId ? this.idToDOMNode.get(nodeId) || null : null;
    }
    documentUpdated() {
        // If this frame doesn't have a document now,
        // it means that its document is not requested yet and
        // it will be requested when needed. (ex: setChildNodes event is received for the frame owner node)
        // So, we don't need to request the document if we don't
        // already have a document.
        const alreadyHasDocument = Boolean(this.#document);
        this.setDocument(null);
        // If we have this.#pendingDocumentRequestPromise in flight,
        // it will contain most recent result.
        if (this.parentModel() && alreadyHasDocument && !this.#pendingDocumentRequestPromise) {
            void this.requestDocument();
        }
    }
    setDocument(payload) {
        this.idToDOMNode = new Map();
        this.frameIdToOwnerNode = new Map();
        if (payload && 'nodeId' in payload) {
            const mainFrameId = this.target().model(ResourceTreeModel)?.mainFrame?.id;
            this.#document = new DOMDocument(this, payload, mainFrameId);
        }
        else {
            this.#document = null;
        }
        this.#undoStack().dispose(this);
        if (!this.parentModel()) {
            this.dispatchEventToListeners(Events.DocumentUpdated, this);
        }
    }
    setDocumentForTest(document) {
        this.setDocument(document);
    }
    setDetachedRoot(payload) {
        if (payload.nodeName === '#document') {
            new DOMDocument(this, payload);
        }
        else {
            DOMNode.create(this, null, false, payload);
        }
    }
    setChildNodes(parentId, payloads) {
        if (!parentId && payloads.length) {
            this.setDetachedRoot(payloads[0]);
            return;
        }
        const parent = this.idToDOMNode.get(parentId);
        parent?.setChildrenPayload(payloads);
    }
    childNodeCountUpdated(nodeId, newValue) {
        const node = this.idToDOMNode.get(nodeId);
        if (!node) {
            console.error('nodeId could not be resolved to a node');
            return;
        }
        node.setChildNodeCount(newValue);
        this.dispatchEventToListeners(Events.ChildNodeCountUpdated, node);
        this.scheduleMutationEvent(node);
    }
    childNodeInserted(parentId, prevId, payload) {
        const parent = this.idToDOMNode.get(parentId);
        const prev = this.idToDOMNode.get(prevId);
        if (!parent) {
            console.error('parentId could not be resolved to a node');
            return;
        }
        const node = parent.insertChild(prev, payload);
        this.idToDOMNode.set(node.id, node);
        this.dispatchEventToListeners(Events.NodeInserted, node);
        this.scheduleMutationEvent(node);
    }
    childNodeRemoved(parentId, nodeId) {
        const parent = this.idToDOMNode.get(parentId);
        const node = this.idToDOMNode.get(nodeId);
        if (!parent || !node) {
            console.error('parentId or nodeId could not be resolved to a node');
            return;
        }
        parent.removeChild(node);
        this.unbind(node);
        this.dispatchEventToListeners(Events.NodeRemoved, { node, parent });
        this.scheduleMutationEvent(node);
    }
    shadowRootPushed(hostId, root) {
        const host = this.idToDOMNode.get(hostId);
        if (!host) {
            return;
        }
        const node = DOMNode.create(this, host.ownerDocument, true, root);
        node.parentNode = host;
        this.idToDOMNode.set(node.id, node);
        host.shadowRootsInternal.unshift(node);
        this.dispatchEventToListeners(Events.NodeInserted, node);
        this.scheduleMutationEvent(node);
    }
    shadowRootPopped(hostId, rootId) {
        const host = this.idToDOMNode.get(hostId);
        if (!host) {
            return;
        }
        const root = this.idToDOMNode.get(rootId);
        if (!root) {
            return;
        }
        host.removeChild(root);
        this.unbind(root);
        this.dispatchEventToListeners(Events.NodeRemoved, { node: root, parent: host });
        this.scheduleMutationEvent(root);
    }
    pseudoElementAdded(parentId, pseudoElement) {
        const parent = this.idToDOMNode.get(parentId);
        if (!parent) {
            return;
        }
        const node = DOMNode.create(this, parent.ownerDocument, false, pseudoElement);
        node.parentNode = parent;
        this.idToDOMNode.set(node.id, node);
        const pseudoType = node.pseudoType();
        if (!pseudoType) {
            throw new Error('DOMModel._pseudoElementAdded expects pseudoType to be defined.');
        }
        const currentPseudoElements = parent.pseudoElements().get(pseudoType);
        if (currentPseudoElements && currentPseudoElements.length > 0) {
            if (!(pseudoType.startsWith('view-transition') || pseudoType.startsWith('scroll-') || pseudoType === 'column')) {
                throw new Error('DOMModel.pseudoElementAdded expects parent to not already have this pseudo type added; only view-transition* and scrolling pseudo elements can coexist under the same parent.' +
                    ` ${currentPseudoElements.length} elements of type ${pseudoType} already exist on parent.`);
            }
            currentPseudoElements.push(node);
        }
        else {
            parent.pseudoElements().set(pseudoType, [node]);
        }
        this.dispatchEventToListeners(Events.NodeInserted, node);
        this.scheduleMutationEvent(node);
    }
    adoptedStyleSheetsModified(parentId, styleSheets) {
        const parent = this.idToDOMNode.get(parentId);
        if (!parent) {
            return;
        }
        parent.setAdoptedStyleSheets(styleSheets);
    }
    scrollableFlagUpdated(nodeId, isScrollable) {
        const node = this.nodeForId(nodeId);
        if (!node || node.isScrollable() === isScrollable) {
            return;
        }
        node.setIsScrollable(isScrollable);
    }
    adRelatedStateUpdated(nodeId, adProvenance) {
        const node = this.nodeForId(nodeId);
        if (!node) {
            return;
        }
        node.setIsAdRelated(adProvenance);
    }
    affectedByStartingStylesFlagUpdated(nodeId, affectedByStartingStyles) {
        const node = this.nodeForId(nodeId);
        if (!node || node.affectedByStartingStyles() === affectedByStartingStyles) {
            return;
        }
        node.setAffectedByStartingStyles(affectedByStartingStyles);
        this.dispatchEventToListeners(Events.AffectedByStartingStylesFlagUpdated, { node });
    }
    pseudoElementRemoved(parentId, pseudoElementId) {
        const parent = this.idToDOMNode.get(parentId);
        if (!parent) {
            return;
        }
        const pseudoElement = this.idToDOMNode.get(pseudoElementId);
        if (!pseudoElement) {
            return;
        }
        parent.removeChild(pseudoElement);
        this.unbind(pseudoElement);
        this.dispatchEventToListeners(Events.NodeRemoved, { node: pseudoElement, parent });
        this.scheduleMutationEvent(pseudoElement);
    }
    distributedNodesUpdated(insertionPointId, distributedNodes) {
        const insertionPoint = this.idToDOMNode.get(insertionPointId);
        if (!insertionPoint) {
            return;
        }
        insertionPoint.setDistributedNodePayloads(distributedNodes);
        this.dispatchEventToListeners(Events.DistributedNodesChanged, insertionPoint);
        this.scheduleMutationEvent(insertionPoint);
    }
    unbind(node) {
        this.idToDOMNode.delete(node.id);
        const frameId = node.frameOwnerFrameId();
        if (frameId) {
            this.frameIdToOwnerNode.delete(frameId);
        }
        const children = node.children();
        for (let i = 0; children && i < children.length; ++i) {
            this.unbind(children[i]);
        }
        for (let i = 0; i < node.shadowRootsInternal.length; ++i) {
            this.unbind(node.shadowRootsInternal[i]);
        }
        const pseudoElements = node.pseudoElements();
        for (const value of pseudoElements.values()) {
            for (const pseudoElement of value) {
                this.unbind(pseudoElement);
            }
        }
        const templateContent = node.templateContent();
        if (templateContent) {
            this.unbind(templateContent);
        }
    }
    async getNodesByStyle(computedStyles, pierce = false) {
        await this.requestDocument();
        if (!this.#document) {
            throw new Error('DOMModel.getNodesByStyle expects to have a document.');
        }
        const response = await this.agent.invoke_getNodesForSubtreeByStyle({ nodeId: this.#document.id, computedStyles, pierce });
        if (response.getError()) {
            throw new Error(response.getError());
        }
        return response.nodeIds;
    }
    async performSearch(query, includeUserAgentShadowDOM) {
        const response = await this.agent.invoke_performSearch({ query, includeUserAgentShadowDOM });
        if (!response.getError()) {
            this.#searchId = response.searchId;
        }
        return response.getError() ? 0 : response.resultCount;
    }
    async searchResult(index) {
        if (!this.#searchId) {
            return null;
        }
        const { nodeIds } = await this.agent.invoke_getSearchResults({ searchId: this.#searchId, fromIndex: index, toIndex: index + 1 });
        return nodeIds?.length === 1 ? this.nodeForId(nodeIds[0]) : null;
    }
    cancelSearch() {
        if (!this.#searchId) {
            return;
        }
        void this.agent.invoke_discardSearchResults({ searchId: this.#searchId });
        this.#searchId = undefined;
    }
    classNamesPromise(nodeId) {
        return this.agent.invoke_collectClassNamesFromSubtree({ nodeId }).then(({ classNames }) => classNames || []);
    }
    querySelector(nodeId, selector) {
        return this.agent.invoke_querySelector({ nodeId, selector }).then(({ nodeId }) => nodeId);
    }
    querySelectorAll(nodeId, selector) {
        return this.agent.invoke_querySelectorAll({ nodeId, selector }).then(({ nodeIds }) => nodeIds);
    }
    getTopLayerElements() {
        return this.agent.invoke_getTopLayerElements().then(({ nodeIds }) => nodeIds);
    }
    topLayerElementsUpdated() {
        void this.#topLayerThrottler.schedule(async () => {
            // This returns top layer nodes for all local frames.
            const result = await this.agent.invoke_getTopLayerElements();
            if (result.getError()) {
                return;
            }
            // Re-set indexes as we re-create top layer nodes list.
            const previousDocs = new Set();
            for (const node of this.#topLayerNodes) {
                node.setTopLayerIndex(-1);
                if (node.ownerDocument) {
                    previousDocs.add(node.ownerDocument);
                }
            }
            this.#topLayerNodes.splice(0);
            const nodes = result.nodeIds.map(id => this.idToDOMNode.get(id)).filter((node) => Boolean(node));
            const nodesByDocument = new Map();
            for (const node of nodes) {
                const document = node.ownerDocument;
                if (!document) {
                    continue;
                }
                if (!nodesByDocument.has(document)) {
                    nodesByDocument.set(document, []);
                }
                nodesByDocument.get(document)?.push(node);
            }
            for (const [document, nodes] of nodesByDocument) {
                let topLayerIdx = 1;
                const documentShortcuts = [];
                for (const [idx, node] of nodes.entries()) {
                    if (node.nodeName() === '::backdrop') {
                        continue;
                    }
                    const childShortcuts = [];
                    const previousNode = result.nodeIds[idx - 1] ? this.idToDOMNode.get(result.nodeIds[idx - 1]) : null;
                    if (previousNode && previousNode.nodeName() === '::backdrop') {
                        childShortcuts.push(new DOMNodeShortcut(this.target(), previousNode.backendNodeId(), 0, previousNode.nodeName()));
                    }
                    const shortcut = new DOMNodeShortcut(this.target(), node.backendNodeId(), 0, node.nodeName(), childShortcuts);
                    node.setTopLayerIndex(topLayerIdx++);
                    this.#topLayerNodes.push(node);
                    documentShortcuts.push(shortcut);
                    previousDocs.delete(document);
                }
                this.dispatchEventToListeners(Events.TopLayerElementsChanged, {
                    document,
                    documentShortcuts,
                });
            }
            // Emit empty events for documents that are no longer in the top layer.
            for (const document of previousDocs) {
                this.dispatchEventToListeners(Events.TopLayerElementsChanged, {
                    document,
                    documentShortcuts: [],
                });
            }
        });
    }
    getDetachedDOMNodes() {
        return this.agent.invoke_getDetachedDomNodes().then(({ detachedNodes }) => detachedNodes);
    }
    getElementByRelation(nodeId, relation) {
        return this.agent.invoke_getElementByRelation({ nodeId, relation }).then(({ nodeId }) => nodeId);
    }
    markUndoableState(minorChange) {
        void this.#undoStack().markUndoableState(this, minorChange || false);
    }
    async nodeForLocation(x, y, includeUserAgentShadowDOM) {
        const response = await this.agent.invoke_getNodeForLocation({ x, y, includeUserAgentShadowDOM });
        if (response.getError() || !response.nodeId) {
            return null;
        }
        return this.nodeForId(response.nodeId);
    }
    async getContainerForNode(nodeId, containerName, physicalAxes, logicalAxes, queriesScrollState, queriesAnchored) {
        const { nodeId: containerNodeId } = await this.agent.invoke_getContainerForNode({ nodeId, containerName, physicalAxes, logicalAxes, queriesScrollState, queriesAnchored });
        if (!containerNodeId) {
            return null;
        }
        return this.nodeForId(containerNodeId);
    }
    pushObjectAsNodeToFrontend(object) {
        return object.isNode() && object.objectId ? this.pushNodeToFrontend(object.objectId) : Promise.resolve(null);
    }
    suspendModel() {
        return this.agent.invoke_disable().then(() => this.setDocument(null));
    }
    async resumeModel() {
        await this.agent.invoke_enable({});
    }
    dispose() {
        this.#resourceTreeModel?.removeEventListener(ResourceTreeModelEvents.DocumentOpened, this.onDocumentOpened, this);
        this.#undoStack().dispose(this);
    }
    // TODO(crbug.com/493763857): Remove fallback once all unit tests use TestUniverse.
    #undoStack() {
        const context = this.target().targetManager().context;
        if ('has' in context && typeof context.has === 'function' && context.has(DOMModelUndoStack)) {
            return context.get(DOMModelUndoStack);
        }
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        return DOMModelUndoStack.instance();
    }
    parentModel() {
        const parentTarget = this.target().parentTarget();
        return parentTarget ? parentTarget.model(DOMModel) : null;
    }
    getAgent() {
        return this.agent;
    }
    registerNode(node) {
        this.idToDOMNode.set(node.id, node);
        const frameId = node.frameOwnerFrameId();
        if (frameId) {
            this.frameIdToOwnerNode.set(frameId, node);
        }
    }
}
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["AttrModified"] = "AttrModified";
    Events["AttrRemoved"] = "AttrRemoved";
    Events["CharacterDataModified"] = "CharacterDataModified";
    Events["DOMMutated"] = "DOMMutated";
    Events["DocumentURLChanged"] = "DocumentURLChanged";
    Events["NodeInserted"] = "NodeInserted";
    Events["NodeRemoved"] = "NodeRemoved";
    Events["DocumentUpdated"] = "DocumentUpdated";
    Events["ChildNodeCountUpdated"] = "ChildNodeCountUpdated";
    Events["DistributedNodesChanged"] = "DistributedNodesChanged";
    Events["MarkersChanged"] = "MarkersChanged";
    Events["TopLayerElementsChanged"] = "TopLayerElementsChanged";
    Events["AffectedByStartingStylesFlagUpdated"] = "AffectedByStartingStylesFlagUpdated";
    Events["AdoptedStyleSheetsModified"] = "AdoptedStyleSheetsModified";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
class DOMDispatcher {
    #domModel;
    constructor(domModel) {
        this.#domModel = domModel;
    }
    documentUpdated() {
        this.#domModel.documentUpdated();
    }
    attributeModified({ nodeId, name, value }) {
        this.#domModel.attributeModified(nodeId, name, value);
    }
    attributeRemoved({ nodeId, name }) {
        this.#domModel.attributeRemoved(nodeId, name);
    }
    adoptedStyleSheetsModified({ nodeId, adoptedStyleSheets }) {
        this.#domModel.adoptedStyleSheetsModified(nodeId, adoptedStyleSheets);
    }
    inlineStyleInvalidated({ nodeIds }) {
        this.#domModel.inlineStyleInvalidated(nodeIds);
    }
    characterDataModified({ nodeId, characterData }) {
        this.#domModel.characterDataModified(nodeId, characterData);
    }
    setChildNodes({ parentId, nodes }) {
        this.#domModel.setChildNodes(parentId, nodes);
    }
    childNodeCountUpdated({ nodeId, childNodeCount }) {
        this.#domModel.childNodeCountUpdated(nodeId, childNodeCount);
    }
    childNodeInserted({ parentNodeId, previousNodeId, node }) {
        this.#domModel.childNodeInserted(parentNodeId, previousNodeId, node);
    }
    childNodeRemoved({ parentNodeId, nodeId }) {
        this.#domModel.childNodeRemoved(parentNodeId, nodeId);
    }
    shadowRootPushed({ hostId, root }) {
        this.#domModel.shadowRootPushed(hostId, root);
    }
    shadowRootPopped({ hostId, rootId }) {
        this.#domModel.shadowRootPopped(hostId, rootId);
    }
    pseudoElementAdded({ parentId, pseudoElement }) {
        this.#domModel.pseudoElementAdded(parentId, pseudoElement);
    }
    pseudoElementRemoved({ parentId, pseudoElementId }) {
        this.#domModel.pseudoElementRemoved(parentId, pseudoElementId);
    }
    distributedNodesUpdated({ insertionPointId, distributedNodes }) {
        this.#domModel.distributedNodesUpdated(insertionPointId, distributedNodes);
    }
    topLayerElementsUpdated() {
        this.#domModel.topLayerElementsUpdated();
    }
    scrollableFlagUpdated({ nodeId, isScrollable }) {
        this.#domModel.scrollableFlagUpdated(nodeId, isScrollable);
    }
    affectedByStartingStylesFlagUpdated({ nodeId, affectedByStartingStyles }) {
        this.#domModel.affectedByStartingStylesFlagUpdated(nodeId, affectedByStartingStyles);
    }
    adRelatedStateUpdated({ nodeId, adProvenance }) {
        this.#domModel.adRelatedStateUpdated(nodeId, adProvenance);
    }
}
export class DOMModelUndoStack {
    #stack;
    #index;
    #lastModelWithMinorChange;
    constructor() {
        this.#stack = [];
        this.#index = 0;
        this.#lastModelWithMinorChange = null;
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!Root.DevToolsContext.globalInstance().has(DOMModelUndoStack) || forceNew) {
            Root.DevToolsContext.globalInstance().set(DOMModelUndoStack, new DOMModelUndoStack());
        }
        return Root.DevToolsContext.globalInstance().get(DOMModelUndoStack);
    }
    async markUndoableState(model, minorChange) {
        // Both minor and major changes get into the #stack, but minor updates are coalesced.
        // Commit major undoable state in the old model upon model switch.
        if (this.#lastModelWithMinorChange && model !== this.#lastModelWithMinorChange) {
            this.#lastModelWithMinorChange.markUndoableState();
            this.#lastModelWithMinorChange = null;
        }
        // Previous minor change is already in the #stack.
        if (minorChange && this.#lastModelWithMinorChange === model) {
            return;
        }
        this.#stack = this.#stack.slice(0, this.#index);
        this.#stack.push(model);
        this.#index = this.#stack.length;
        // Delay marking as major undoable states in case of minor operations until the
        // major or model switch.
        if (minorChange) {
            this.#lastModelWithMinorChange = model;
        }
        else {
            await model.getAgent().invoke_markUndoableState();
            this.#lastModelWithMinorChange = null;
        }
    }
    async undo() {
        if (this.#index === 0) {
            return await Promise.resolve();
        }
        --this.#index;
        this.#lastModelWithMinorChange = null;
        await this.#stack[this.#index].getAgent().invoke_undo();
    }
    async redo() {
        if (this.#index >= this.#stack.length) {
            return await Promise.resolve();
        }
        ++this.#index;
        this.#lastModelWithMinorChange = null;
        await this.#stack[this.#index - 1].getAgent().invoke_redo();
    }
    dispose(model) {
        let shift = 0;
        for (let i = 0; i < this.#index; ++i) {
            if (this.#stack[i] === model) {
                ++shift;
            }
        }
        Platform.ArrayUtilities.removeElement(this.#stack, model);
        this.#index -= shift;
        if (this.#lastModelWithMinorChange === model) {
            this.#lastModelWithMinorChange = null;
        }
    }
}
SDKModel.register(DOMModel, { capabilities: 2 /* Capability.DOM */, autostart: true });
export class DOMNodeSnapshot extends DOMNode {
    init(_doc, _isInShadowTree, _payload, _retainedNodes) {
    }
    setNodeName(_name, _callback) {
    }
    setNodeValue(_value, _callback) {
    }
    setAttribute(_name, _text, _callback) {
    }
    setAttributeValue(_name, _value, _callback) {
    }
    removeAttribute(_name) {
        return Promise.resolve();
    }
    setOuterHTML(_html, _callback) {
    }
    removeNode(_callback) {
        return Promise.resolve();
    }
    copyTo(_targetNode, _anchorNode, _callback) {
    }
    moveTo(_targetNode, _anchorNode, _callback) {
    }
    duplicate() {
        return Promise.resolve({ error: null, node: null });
    }
    canInspectNode() {
        return false;
    }
    setAsInspectedNode() {
        return Promise.resolve();
    }
}
export class DOMDocumentSnapshot extends DOMDocument {
    #snapshotSecurityOrigin;
    constructor(domModel, payload, frameId, securityOrigin) {
        super(domModel, payload, frameId);
        this.#snapshotSecurityOrigin = securityOrigin;
    }
    securityOrigin() {
        return this.#snapshotSecurityOrigin;
    }
    init(_doc, _isInShadowTree, _payload, _retainedNodes) {
    }
    setNodeName(_name, _callback) {
    }
    setNodeValue(_value, _callback) {
    }
    setAttribute(_name, _text, _callback) {
    }
    setAttributeValue(_name, _value, _callback) {
    }
    removeAttribute(_name) {
        return Promise.resolve();
    }
    setOuterHTML(_html, _callback) {
    }
    removeNode(_callback) {
        return Promise.resolve();
    }
    copyTo(_targetNode, _anchorNode, _callback) {
    }
    moveTo(_targetNode, _anchorNode, _callback) {
    }
    duplicate() {
        return Promise.resolve({ error: null, node: null });
    }
    canInspectNode() {
        return false;
    }
    setAsInspectedNode() {
        return Promise.resolve();
    }
}
//# sourceMappingURL=DOMModel.js.map