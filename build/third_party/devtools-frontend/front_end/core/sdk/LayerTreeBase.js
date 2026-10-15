// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { DOMModel } from './DOMModel.js';
export class StickyPositionConstraint {
    #stickyBoxRect;
    #containingBlockRect;
    #nearestLayerShiftingStickyBox;
    #nearestLayerShiftingContainingBlock;
    constructor(layerTree, constraint) {
        this.#stickyBoxRect = constraint.stickyBoxRect;
        this.#containingBlockRect = constraint.containingBlockRect;
        this.#nearestLayerShiftingStickyBox = null;
        if (layerTree && constraint.nearestLayerShiftingStickyBox) {
            this.#nearestLayerShiftingStickyBox = layerTree.layerById(constraint.nearestLayerShiftingStickyBox);
        }
        this.#nearestLayerShiftingContainingBlock = null;
        if (layerTree && constraint.nearestLayerShiftingContainingBlock) {
            this.#nearestLayerShiftingContainingBlock = layerTree.layerById(constraint.nearestLayerShiftingContainingBlock);
        }
    }
    stickyBoxRect() {
        return this.#stickyBoxRect;
    }
    containingBlockRect() {
        return this.#containingBlockRect;
    }
    nearestLayerShiftingStickyBox() {
        return this.#nearestLayerShiftingStickyBox;
    }
    nearestLayerShiftingContainingBlock() {
        return this.#nearestLayerShiftingContainingBlock;
    }
}
export class LayerTreeBase {
    #target;
    #domModel;
    layersById = new Map();
    #root = null;
    #contentRoot = null;
    #backendNodeIdToNode = new Map();
    #viewportSize;
    constructor(target) {
        this.#target = target;
        this.#domModel = target ? target.model(DOMModel) : null;
    }
    target() {
        return this.#target;
    }
    root() {
        return this.#root;
    }
    setRoot(root) {
        this.#root = root;
    }
    contentRoot() {
        return this.#contentRoot;
    }
    setContentRoot(contentRoot) {
        this.#contentRoot = contentRoot;
    }
    forEachLayer(callback, root) {
        if (!root) {
            root = this.root();
            if (!root) {
                return false;
            }
        }
        return callback(root) || root.children().some(this.forEachLayer.bind(this, callback));
    }
    layerById(id) {
        return this.layersById.get(id) || null;
    }
    async resolveBackendNodeIds(requestedNodeIds) {
        if (!requestedNodeIds.size || !this.#domModel) {
            return;
        }
        const nodesMap = await this.#domModel.pushNodesByBackendIdsToFrontend(requestedNodeIds);
        if (!nodesMap) {
            return;
        }
        for (const nodeId of nodesMap.keys()) {
            this.#backendNodeIdToNode.set(nodeId, nodesMap.get(nodeId) || null);
        }
    }
    backendNodeIdToNode() {
        return this.#backendNodeIdToNode;
    }
    setViewportSize(viewportSize) {
        this.#viewportSize = viewportSize;
    }
    viewportSize() {
        return this.#viewportSize;
    }
}
//# sourceMappingURL=LayerTreeBase.js.map