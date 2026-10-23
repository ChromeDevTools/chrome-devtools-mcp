// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as HeapSnapshotModel from '../../models/heap_snapshot/heap_snapshot.js';
export class AllocationProfile {
    #strings;
    #nextNodeId = 1;
    #functionInfos = [];
    #idToNode = {};
    #idToTopDownNode = {};
    #collapsedTopNodeIdToFunctionInfo = {};
    #traceTops = null;
    constructor(profile, liveObjectStats) {
        this.#strings = profile.strings;
        this.#buildFunctionAllocationInfos(profile);
        this.#buildAllocationTree(profile, liveObjectStats);
    }
    #buildFunctionAllocationInfos(profile) {
        const strings = this.#strings;
        const functionInfoFields = profile.snapshot.meta.trace_function_info_fields;
        const functionNameOffset = functionInfoFields.indexOf('name');
        const scriptNameOffset = functionInfoFields.indexOf('script_name');
        const scriptIdOffset = functionInfoFields.indexOf('script_id');
        const lineOffset = functionInfoFields.indexOf('line');
        const columnOffset = functionInfoFields.indexOf('column');
        const functionInfoFieldCount = functionInfoFields.length;
        const rawInfos = profile.trace_function_infos;
        const infoLength = rawInfos.length;
        const functionInfos = this.#functionInfos = new Array(infoLength / functionInfoFieldCount);
        let index = 0;
        for (let i = 0; i < infoLength; i += functionInfoFieldCount) {
            functionInfos[index++] = new FunctionAllocationInfo(strings[rawInfos[i + functionNameOffset]], strings[rawInfos[i + scriptNameOffset]], rawInfos[i + scriptIdOffset], rawInfos[i + lineOffset], rawInfos[i + columnOffset]);
        }
    }
    #buildAllocationTree(profile, liveObjectStats) {
        const traceTreeRaw = profile.trace_tree;
        const functionInfos = this.#functionInfos;
        const idToTopDownNode = this.#idToTopDownNode;
        const traceNodeFields = profile.snapshot.meta.trace_node_fields;
        const nodeIdOffset = traceNodeFields.indexOf('id');
        const functionInfoIndexOffset = traceNodeFields.indexOf('function_info_index');
        const allocationCountOffset = traceNodeFields.indexOf('count');
        const allocationSizeOffset = traceNodeFields.indexOf('size');
        const childrenOffset = traceNodeFields.indexOf('children');
        const nodeFieldCount = traceNodeFields.length;
        function traverseNode(
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawNodeArray, nodeOffset, parent) {
            const functionInfo = functionInfos[rawNodeArray[nodeOffset + functionInfoIndexOffset]];
            const id = rawNodeArray[nodeOffset + nodeIdOffset];
            const stats = liveObjectStats[id];
            const liveCount = stats ? stats.count : 0;
            const liveSize = stats ? stats.size : 0;
            const result = new TopDownAllocationNode(id, functionInfo, rawNodeArray[nodeOffset + allocationCountOffset], rawNodeArray[nodeOffset + allocationSizeOffset], liveCount, liveSize, parent);
            idToTopDownNode[id] = result;
            functionInfo.addTraceTopNode(result);
            const rawChildren = rawNodeArray[nodeOffset + childrenOffset];
            for (let i = 0; i < rawChildren.length; i += nodeFieldCount) {
                result.children.push(traverseNode(rawChildren, i, result));
            }
            return result;
        }
        return traverseNode(traceTreeRaw, 0, null);
    }
    serializeTraceTops() {
        if (this.#traceTops) {
            return this.#traceTops;
        }
        const result = this.#traceTops = [];
        const functionInfos = this.#functionInfos;
        for (let i = 0; i < functionInfos.length; i++) {
            const info = functionInfos[i];
            if (info.totalCount === 0) {
                continue;
            }
            const nodeId = this.#nextNodeId++;
            const isRoot = i === 0;
            result.push(this.#serializeNode(nodeId, info, info.totalCount, info.totalSize, info.totalLiveCount, info.totalLiveSize, !isRoot));
            this.#collapsedTopNodeIdToFunctionInfo[nodeId] = info;
        }
        result.sort(function (a, b) {
            return b.size - a.size;
        });
        return result;
    }
    serializeCallers(nodeId) {
        let node = this.#ensureBottomUpNode(nodeId);
        const nodesWithSingleCaller = [];
        while (node.callers().length === 1) {
            node = node.callers()[0];
            nodesWithSingleCaller.push(this.#serializeCaller(node));
        }
        const branchingCallers = [];
        const callers = node.callers();
        for (let i = 0; i < callers.length; i++) {
            branchingCallers.push(this.#serializeCaller(callers[i]));
        }
        return new HeapSnapshotModel.HeapSnapshotModel.AllocationNodeCallers(nodesWithSingleCaller, branchingCallers);
    }
    serializeAllocationStack(traceNodeId) {
        let node = this.#idToTopDownNode[traceNodeId];
        const result = [];
        while (node) {
            const functionInfo = node.functionInfo;
            result.push(new HeapSnapshotModel.HeapSnapshotModel.AllocationStackFrame(functionInfo.functionName, functionInfo.scriptName, functionInfo.scriptId, functionInfo.line, functionInfo.column));
            node = node.parent;
        }
        return result;
    }
    traceIds(allocationNodeId) {
        return this.#ensureBottomUpNode(allocationNodeId).traceTopIds;
    }
    #ensureBottomUpNode(nodeId) {
        let node = this.#idToNode[nodeId];
        if (!node) {
            const functionInfo = this.#collapsedTopNodeIdToFunctionInfo[nodeId];
            node = functionInfo.bottomUpRoot();
            delete this.#collapsedTopNodeIdToFunctionInfo[nodeId];
            this.#idToNode[nodeId] = node;
        }
        return node;
    }
    #serializeCaller(node) {
        const callerId = this.#nextNodeId++;
        this.#idToNode[callerId] = node;
        return this.#serializeNode(callerId, node.functionInfo, node.allocationCount, node.allocationSize, node.liveCount, node.liveSize, node.hasCallers());
    }
    #serializeNode(nodeId, functionInfo, count, size, liveCount, liveSize, hasChildren) {
        return new HeapSnapshotModel.HeapSnapshotModel.SerializedAllocationNode(nodeId, functionInfo.functionName, functionInfo.scriptName, functionInfo.scriptId, functionInfo.line, functionInfo.column, count, size, liveCount, liveSize, hasChildren);
    }
}
export class TopDownAllocationNode {
    id;
    functionInfo;
    allocationCount;
    allocationSize;
    liveCount;
    liveSize;
    parent;
    children = [];
    constructor(id, functionInfo, count, size, liveCount, liveSize, parent) {
        this.id = id;
        this.functionInfo = functionInfo;
        this.allocationCount = count;
        this.allocationSize = size;
        this.liveCount = liveCount;
        this.liveSize = liveSize;
        this.parent = parent;
    }
}
export class BottomUpAllocationNode {
    functionInfo;
    allocationCount = 0;
    allocationSize = 0;
    liveCount = 0;
    liveSize = 0;
    traceTopIds = [];
    #callers = [];
    constructor(functionInfo) {
        this.functionInfo = functionInfo;
    }
    addCaller(traceNode) {
        const functionInfo = traceNode.functionInfo;
        let result;
        for (let i = 0; i < this.#callers.length; i++) {
            const caller = this.#callers[i];
            if (caller.functionInfo === functionInfo) {
                result = caller;
                break;
            }
        }
        if (!result) {
            result = new BottomUpAllocationNode(functionInfo);
            this.#callers.push(result);
        }
        return result;
    }
    callers() {
        return this.#callers;
    }
    hasCallers() {
        return this.#callers.length > 0;
    }
}
export class FunctionAllocationInfo {
    functionName;
    scriptName;
    scriptId;
    line;
    column;
    totalCount = 0;
    totalSize = 0;
    totalLiveCount = 0;
    totalLiveSize = 0;
    #traceTops = [];
    #bottomUpTree;
    constructor(functionName, scriptName, scriptId, line, column) {
        this.functionName = functionName;
        this.scriptName = scriptName;
        this.scriptId = scriptId;
        this.line = line;
        this.column = column;
    }
    addTraceTopNode(node) {
        if (node.allocationCount === 0) {
            return;
        }
        this.#traceTops.push(node);
        this.totalCount += node.allocationCount;
        this.totalSize += node.allocationSize;
        this.totalLiveCount += node.liveCount;
        this.totalLiveSize += node.liveSize;
    }
    bottomUpRoot() {
        if (!this.#traceTops.length) {
            return null;
        }
        if (!this.#bottomUpTree) {
            this.#buildAllocationTraceTree();
        }
        return this.#bottomUpTree ?? null;
    }
    #buildAllocationTraceTree() {
        this.#bottomUpTree = new BottomUpAllocationNode(this);
        for (let i = 0; i < this.#traceTops.length; i++) {
            let node = this.#traceTops[i];
            let bottomUpNode = this.#bottomUpTree;
            const count = node.allocationCount;
            const size = node.allocationSize;
            const liveCount = node.liveCount;
            const liveSize = node.liveSize;
            const traceId = node.id;
            while (true) {
                bottomUpNode.allocationCount += count;
                bottomUpNode.allocationSize += size;
                bottomUpNode.liveCount += liveCount;
                bottomUpNode.liveSize += liveSize;
                bottomUpNode.traceTopIds.push(traceId);
                node = node.parent;
                if (node === null) {
                    break;
                }
                bottomUpNode = bottomUpNode.addCaller(node);
            }
        }
    }
}
//# sourceMappingURL=AllocationProfile.js.map