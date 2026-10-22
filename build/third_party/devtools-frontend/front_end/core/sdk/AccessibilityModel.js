// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { DeferredDOMNode, DOMDocument, DOMModel, Events as DOMModelEvents } from './DOMModel.js';
import { SDKModel } from './SDKModel.js';
export var CoreAxPropertyName;
(function (CoreAxPropertyName) {
    CoreAxPropertyName["NAME"] = "name";
    CoreAxPropertyName["DESCRIPTION"] = "description";
    CoreAxPropertyName["VALUE"] = "value";
    CoreAxPropertyName["ROLE"] = "role";
})(CoreAxPropertyName || (CoreAxPropertyName = {}));
export class AccessibilityNode {
    #accessibilityModel;
    #frameManager;
    #id;
    #backendDOMNodeId;
    #deferredDOMNode;
    #ignored;
    #ignoredReasons;
    #role;
    #name;
    #description;
    #value;
    #properties;
    #parentId;
    #frameId;
    #childIds;
    constructor(accessibilityModel, payload) {
        this.#accessibilityModel = accessibilityModel;
        this.#frameManager = accessibilityModel.target().targetManager().getFrameManager();
        this.#id = payload.nodeId;
        accessibilityModel.setAXNodeForAXId(this.#id, this);
        if (payload.backendDOMNodeId) {
            accessibilityModel.setAXNodeForBackendDOMNodeId(payload.backendDOMNodeId, this);
            this.#backendDOMNodeId = payload.backendDOMNodeId;
            this.#deferredDOMNode = new DeferredDOMNode(accessibilityModel.target(), payload.backendDOMNodeId);
        }
        else {
            this.#backendDOMNodeId = null;
            this.#deferredDOMNode = null;
        }
        this.#ignored = payload.ignored;
        if (this.#ignored && 'ignoredReasons' in payload) {
            this.#ignoredReasons = payload.ignoredReasons;
        }
        this.#role = payload.role || null;
        this.#name = payload.name || null;
        this.#description = payload.description || null;
        this.#value = payload.value || null;
        this.#properties = payload.properties || null;
        this.#childIds = [...new Set(payload.childIds)];
        this.#parentId = payload.parentId || null;
        if (payload.frameId && !payload.parentId) {
            this.#frameId = payload.frameId;
            accessibilityModel.setRootAXNodeForFrameId(payload.frameId, this);
        }
        else {
            this.#frameId = null;
        }
    }
    id() {
        return this.#id;
    }
    accessibilityModel() {
        return this.#accessibilityModel;
    }
    ignored() {
        return this.#ignored;
    }
    ignoredReasons() {
        return this.#ignoredReasons || null;
    }
    role() {
        return this.#role || null;
    }
    coreProperties() {
        const properties = [];
        if (this.#name) {
            properties.push({ name: "name" /* CoreAxPropertyName.NAME */, value: this.#name });
        }
        if (this.#description) {
            properties.push({ name: "description" /* CoreAxPropertyName.DESCRIPTION */, value: this.#description });
        }
        if (this.#value) {
            properties.push({ name: "value" /* CoreAxPropertyName.VALUE */, value: this.#value });
        }
        return properties;
    }
    name() {
        return this.#name || null;
    }
    description() {
        return this.#description || null;
    }
    value() {
        return this.#value || null;
    }
    properties() {
        return this.#properties || null;
    }
    parentNode() {
        if (this.#parentId) {
            return this.#accessibilityModel.axNodeForId(this.#parentId);
        }
        return null;
    }
    isDOMNode() {
        return Boolean(this.#backendDOMNodeId);
    }
    backendDOMNodeId() {
        return this.#backendDOMNodeId;
    }
    deferredDOMNode() {
        return this.#deferredDOMNode;
    }
    highlightDOMNode() {
        const deferredNode = this.deferredDOMNode();
        if (!deferredNode) {
            return;
        }
        // Highlight node in page.
        deferredNode.highlight();
    }
    children() {
        if (!this.#childIds) {
            return [];
        }
        const children = [];
        for (const childId of this.#childIds) {
            const child = this.#accessibilityModel.axNodeForId(childId);
            if (child) {
                children.push(child);
            }
        }
        return children;
    }
    numChildren() {
        if (!this.#childIds) {
            return 0;
        }
        return this.#childIds.length;
    }
    hasOnlyUnloadedChildren() {
        if (!this.#childIds || !this.#childIds.length) {
            return false;
        }
        return this.#childIds.every(id => this.#accessibilityModel.axNodeForId(id) === null);
    }
    hasUnloadedChildren() {
        if (!this.#childIds || !this.#childIds.length) {
            return false;
        }
        return this.#childIds.some(id => this.#accessibilityModel.axNodeForId(id) === null);
    }
    // Only the root node gets a frameId, so nodes have to walk up the tree to find their frameId.
    getFrameId() {
        return this.#frameId || this.parentNode()?.getFrameId() || null;
    }
    isLeafNode() {
        return this.numChildren() === 0 && this.role()?.value !== 'Iframe';
    }
    getNodeId() {
        return this.getFrameId() + '#' + this.id();
    }
    async getChildren() {
        if (this.role()?.value === 'Iframe') {
            const domNode = await this.deferredDOMNode()?.resolvePromise();
            if (!domNode) {
                throw new Error('Could not find corresponding DOMNode');
            }
            const frameId = domNode.frameOwnerFrameId();
            if (!frameId) {
                throw new Error('No owner frameId on iframe node');
            }
            const localRoot = await getRootNode(frameId, this.#frameManager);
            return [localRoot];
        }
        return await this.accessibilityModel().requestAXChildren(this.id(), this.getFrameId() || undefined);
    }
    async axNodeToText(depth = 0) {
        const indent = '  '.repeat(depth);
        const role = this.role()?.value || '';
        const name = this.name()?.value || '';
        const properties = this.properties() || [];
        const ignored = this.ignored();
        let childDepth = depth + 1;
        const lines = [];
        if (ignored) {
            if (depth === 0) {
                lines.push('Ignored\n');
            }
            else {
                childDepth = depth;
            }
        }
        else {
            let line = `${indent}${role} "${name}"`;
            for (const prop of properties) {
                if (prop.value && isPrintableType(prop.value.type)) {
                    line += ` ${prop.name}: ${prop.value.value}`;
                }
            }
            lines.push(line + '\n');
        }
        const children = await this.getChildren();
        for (const child of children) {
            lines.push(await child.axNodeToText(childDepth));
        }
        return lines.join('');
    }
}
export var Events;
(function (Events) {
    Events["TREE_UPDATED"] = "TreeUpdated";
})(Events || (Events = {}));
export class AccessibilityModel extends SDKModel {
    agent;
    #axIdToAXNode = new Map();
    #backendDOMNodeIdToAXNode = new Map();
    #frameIdToAXNode = new Map();
    #pendingChildRequests = new Map();
    #root = null;
    constructor(target) {
        super(target);
        target.registerAccessibilityDispatcher(this);
        this.agent = target.accessibilityAgent();
        void this.resumeModel();
        const domModel = target.model(DOMModel);
        if (domModel) {
            domModel.addEventListener(DOMModelEvents.NodeRemoved, () => {
                this.clear();
                this.dispatchEventToListeners("TreeUpdated" /* Events.TREE_UPDATED */, {});
            });
            domModel.addEventListener(DOMModelEvents.NodeInserted, () => {
                this.clear();
                this.dispatchEventToListeners("TreeUpdated" /* Events.TREE_UPDATED */, {});
            });
        }
    }
    clear() {
        this.#root = null;
        this.#axIdToAXNode.clear();
        this.#backendDOMNodeIdToAXNode.clear();
        this.#frameIdToAXNode.clear();
    }
    async resumeModel() {
        await this.agent.invoke_enable();
    }
    async suspendModel() {
        await this.agent.invoke_disable();
    }
    async requestPartialAXTree(node) {
        const { nodes } = await this.agent.invoke_getPartialAXTree({ nodeId: node.id, fetchRelatives: true });
        if (!nodes) {
            return;
        }
        const axNodes = [];
        for (const payload of nodes) {
            axNodes.push(new AccessibilityNode(this, payload));
        }
    }
    loadComplete({ root }) {
        this.clear();
        this.#root = new AccessibilityNode(this, root);
        this.dispatchEventToListeners("TreeUpdated" /* Events.TREE_UPDATED */, { root: this.#root });
    }
    nodesUpdated({ nodes }) {
        this.createNodesFromPayload(nodes);
        this.dispatchEventToListeners("TreeUpdated" /* Events.TREE_UPDATED */, {});
        return;
    }
    createNodesFromPayload(payloadNodes) {
        const accessibilityNodes = payloadNodes.map(node => {
            const sdkNode = new AccessibilityNode(this, node);
            return sdkNode;
        });
        return accessibilityNodes;
    }
    async requestRootNode(frameId) {
        if (frameId && this.#frameIdToAXNode.has(frameId)) {
            return this.#frameIdToAXNode.get(frameId);
        }
        if (!frameId && this.#root) {
            return this.#root;
        }
        const { node } = await this.agent.invoke_getRootAXNode({ frameId });
        if (!node) {
            return;
        }
        return this.createNodesFromPayload([node])[0];
    }
    async requestAXChildren(nodeId, frameId) {
        const parent = this.#axIdToAXNode.get(nodeId);
        if (!parent) {
            return [];
        }
        if (!parent.hasUnloadedChildren()) {
            return parent.children();
        }
        const request = this.#pendingChildRequests.get(nodeId);
        if (request) {
            await request;
        }
        else {
            const request = this.agent.invoke_getChildAXNodes({ id: nodeId, frameId });
            this.#pendingChildRequests.set(nodeId, request);
            const result = await request;
            if (!result.getError()) {
                this.createNodesFromPayload(result.nodes);
                this.#pendingChildRequests.delete(nodeId);
            }
        }
        return this.#axIdToAXNode.get(nodeId)?.children() ?? [];
    }
    async requestAndLoadSubTreeToNode(node) {
        // Node may have already been loaded, so don't bother requesting it again.
        const result = [];
        let ancestor = this.axNodeForDOMNode(node);
        while (ancestor) {
            result.push(ancestor);
            const parent = ancestor.parentNode();
            if (!parent) {
                return result;
            }
            ancestor = parent;
        }
        const { nodes } = await this.agent.invoke_getAXNodeAndAncestors({ backendNodeId: node.backendNodeId() });
        if (!nodes) {
            return null;
        }
        const ancestors = this.createNodesFromPayload(nodes);
        return ancestors;
    }
    axNodeForId(axId) {
        return this.#axIdToAXNode.get(axId) || null;
    }
    setRootAXNodeForFrameId(frameId, axNode) {
        this.#frameIdToAXNode.set(frameId, axNode);
    }
    setAXNodeForAXId(axId, axNode) {
        this.#axIdToAXNode.set(axId, axNode);
    }
    axNodeForDOMNode(domNode) {
        if (!domNode) {
            return null;
        }
        return this.#backendDOMNodeIdToAXNode.get(domNode.backendNodeId()) ?? null;
    }
    setAXNodeForBackendDOMNodeId(backendDOMNodeId, axNode) {
        this.#backendDOMNodeIdToAXNode.set(backendDOMNodeId, axNode);
    }
    getAgent() {
        return this.agent;
    }
}
SDKModel.register(AccessibilityModel, { capabilities: 2 /* Capability.DOM */, autostart: false });
function getModel(frameId, frameManager) {
    const frame = frameManager.getFrame(frameId);
    const model = frame?.resourceTreeModel().target().model(AccessibilityModel);
    if (!model) {
        throw new Error('Could not instantiate model for frameId');
    }
    return model;
}
export async function getRootNode(frameId, frameManager) {
    const model = getModel(frameId, frameManager);
    const root = await model.requestRootNode(frameId);
    if (!root) {
        throw new Error('No accessibility root for frame');
    }
    return root;
}
function getFrameIdForNodeOrDocument(node) {
    let frameId;
    if (node instanceof DOMDocument) {
        frameId = node.body?.frameId();
    }
    else {
        frameId = node.frameId();
    }
    if (!frameId) {
        throw new Error('No frameId for DOM node');
    }
    return frameId;
}
export async function getNodeAndAncestorsFromDOMNode(domNode) {
    const frameManager = domNode.domModel().target().targetManager().getFrameManager();
    let frameId = getFrameIdForNodeOrDocument(domNode);
    const model = getModel(frameId, frameManager);
    const result = await model.requestAndLoadSubTreeToNode(domNode);
    if (!result) {
        throw new Error('Could not retrieve accessibility node for inspected DOM node');
    }
    const outermostFrameId = frameManager.getOutermostFrame()?.id;
    if (!outermostFrameId) {
        return result;
    }
    while (frameId !== outermostFrameId) {
        const node = await frameManager.getFrame(frameId)?.getOwnerDOMNodeOrDocument();
        if (!node) {
            break;
        }
        frameId = getFrameIdForNodeOrDocument(node);
        const model = getModel(frameId, frameManager);
        const ancestors = await model.requestAndLoadSubTreeToNode(node);
        result.push(...ancestors || []);
    }
    return result;
}
export function isPrintableType(valueType) {
    switch (valueType) {
        case "boolean" /* Protocol.Accessibility.AXValueType.Boolean */:
        case "booleanOrUndefined" /* Protocol.Accessibility.AXValueType.BooleanOrUndefined */:
        case "string" /* Protocol.Accessibility.AXValueType.String */:
        case "number" /* Protocol.Accessibility.AXValueType.Number */:
            return true;
        default:
            return false;
    }
}
//# sourceMappingURL=AccessibilityModel.js.map