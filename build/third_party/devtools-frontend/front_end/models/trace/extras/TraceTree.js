// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
const SamplesIntegrator = Helpers.SamplesIntegrator.SamplesIntegrator;
export class Node {
    /** ms */
    totalTime;
    /** ms */
    selfTime;
    transferSize;
    id;
    /** The first trace event encountered that necessitated the creation of this tree node. */
    event;
    /**
     * All of the trace events associated with this aggregate node.
     * Minor: In the case of Event Log (EventsTimelineTreeView), the node is not aggregate and this will only hold 1 event, the same that's in this.event
     */
    events;
    parent;
    groupId;
    isGroupNodeInternal;
    depth;
    constructor(id, event) {
        this.totalTime = 0;
        this.selfTime = 0;
        this.transferSize = 0;
        this.id = id;
        this.event = event;
        this.events = [event];
        this.groupId = '';
        this.isGroupNodeInternal = false;
        this.depth = 0;
    }
    isGroupNode() {
        return this.isGroupNodeInternal;
    }
    hasChildren() {
        throw new Error('Not implemented');
    }
    setHasChildren(_value) {
        throw new Error('Not implemented');
    }
    /**
     * Returns the direct descendants of this node.
     * @returns a map with ordered <nodeId, Node> tuples.
     */
    children() {
        throw new Error('Not implemented');
    }
    searchTree(matchFunction, results) {
        results = results || [];
        if (this.event && matchFunction(this.event)) {
            results.push(this);
        }
        for (const child of this.children().values()) {
            child.searchTree(matchFunction, results);
        }
        return results;
    }
}
export class TopDownNode extends Node {
    root;
    hasChildrenInternal;
    childrenInternal;
    parent;
    constructor(id, event, parent) {
        super(id, event);
        this.root = parent?.root ?? null;
        this.hasChildrenInternal = false;
        this.childrenInternal = null;
        this.parent = parent;
    }
    hasChildren() {
        return this.hasChildrenInternal;
    }
    setHasChildren(value) {
        this.hasChildrenInternal = value;
    }
    children() {
        return this.childrenInternal || this.buildChildren();
    }
    buildChildren() {
        // Tracks the ancestor path of this node, includes the current node.
        const path = [];
        for (let node = this; node.parent && !node.isGroupNode(); node = node.parent) {
            path.push((node));
        }
        path.reverse();
        const children = new Map();
        const self = this;
        const root = this.root;
        if (!root) {
            this.childrenInternal = children;
            return this.childrenInternal;
        }
        const startTime = root.startTime;
        const endTime = root.endTime;
        const instantEventCallback = (root.doNotAggregate || root.includeInstantEvents) ? onInstantEvent : undefined;
        const eventIdCallback = root.doNotAggregate ? undefined : generateEventID;
        const eventGroupIdCallback = root.getEventGroupIdCallback();
        let depth = 0;
        // The amount of ancestors found to match this node's ancestors
        // during the event tree walk.
        let matchedDepth = 0;
        let currentDirectChild = null;
        // Walk on the full event tree to find this node's children.
        Helpers.Trace.forEachEvent(root.events, {
            onStartEvent,
            onEndEvent,
            onInstantEvent: instantEventCallback,
            startTime: Helpers.Timing.milliToMicro(startTime),
            endTime: Helpers.Timing.milliToMicro(endTime),
            eventFilter: root.filter,
            ignoreAsyncEvents: false,
        });
        function onStartEvent(e) {
            const { startTime: currentStartTime, endTime: currentEndTime } = Helpers.Timing.eventTimingsMilliSeconds(e);
            ++depth;
            if (depth > path.length + 2) {
                return;
            }
            if (!matchPath(e)) {
                return;
            }
            const actualEndTime = currentEndTime !== undefined ? Math.min(currentEndTime, endTime) : endTime;
            const duration = actualEndTime - Math.max(startTime, currentStartTime);
            if (duration < 0) {
                console.error('Negative event duration');
            }
            processEvent(e, duration);
        }
        function onInstantEvent(e) {
            ++depth;
            if (matchedDepth === path.length && depth <= path.length + 2) {
                processEvent(e, 0);
            }
            --depth;
        }
        /**
         * Creates a child node.
         */
        function processEvent(e, duration) {
            if (depth === path.length + 2) {
                if (!currentDirectChild) {
                    return;
                }
                currentDirectChild.setHasChildren(true);
                currentDirectChild.selfTime -= duration;
                return;
            }
            let id;
            let groupId = '';
            if (!eventIdCallback) {
                id = Symbol('uniqueId');
            }
            else {
                id = eventIdCallback(e);
                groupId = eventGroupIdCallback ? eventGroupIdCallback(e) : '';
                if (groupId) {
                    id += '/' + groupId;
                }
            }
            let node = children.get(id);
            if (!node) {
                node = new TopDownNode(id, e, self);
                node.groupId = groupId;
                children.set(id, node);
            }
            else {
                node.events.push(e);
            }
            node.selfTime += duration;
            node.totalTime += duration;
            if (Types.Events.isReceivedDataEvent(e)) {
                node.transferSize += e.args.data.encodedDataLength;
            }
            currentDirectChild = node;
        }
        /**
         * Checks if the path of ancestors of an event matches the path of
         * ancestors of the current node. In other words, checks if an event
         * is a child of this node. As the check is done, the partial result
         * is cached on `matchedDepth`, for future checks.
         */
        function matchPath(e) {
            const { endTime } = Helpers.Timing.eventTimingsMilliSeconds(e);
            if (matchedDepth === path.length) {
                return true;
            }
            if (matchedDepth !== depth - 1) {
                return false;
            }
            if (!endTime) {
                return false;
            }
            if (!eventIdCallback) {
                if (e === path[matchedDepth].event) {
                    ++matchedDepth;
                }
                return false;
            }
            let id = eventIdCallback(e);
            const groupId = eventGroupIdCallback ? eventGroupIdCallback(e) : '';
            if (groupId) {
                id += '/' + groupId;
            }
            if (id === path[matchedDepth].id) {
                ++matchedDepth;
            }
            return false;
        }
        function onEndEvent() {
            --depth;
            if (matchedDepth > depth) {
                matchedDepth = depth;
            }
        }
        this.childrenInternal = children;
        return children;
    }
}
export class TopDownRootNode extends TopDownNode {
    filter;
    startTime;
    endTime;
    eventGroupIdCallback;
    /** Default behavior is to aggregate similar trace events into one Node based on generateEventID(), eventGroupIdCallback(), etc. Set true to keep nodes 1:1 with events. */
    doNotAggregate;
    includeInstantEvents;
    totalTime;
    selfTime;
    constructor(events, { filters, startTime, endTime, doNotAggregate, eventGroupIdCallback, includeInstantEvents }) {
        super('', events[0], null);
        this.event = events[0];
        this.root = this;
        this.events = events;
        this.filter = (e) => filters.every(f => f.accept(e));
        this.startTime = startTime;
        this.endTime = endTime;
        this.eventGroupIdCallback = eventGroupIdCallback;
        this.doNotAggregate = doNotAggregate;
        this.includeInstantEvents = includeInstantEvents;
        this.totalTime = endTime - startTime;
        this.selfTime = this.totalTime;
    }
    children() {
        // FYI tree nodes are built lazily. https://codereview.chromium.org/2674283003
        return this.childrenInternal || this.grouppedTopNodes();
    }
    grouppedTopNodes() {
        const flatNodes = super.children();
        for (const node of flatNodes.values()) {
            this.selfTime -= node.totalTime;
        }
        if (!this.eventGroupIdCallback) {
            return flatNodes;
        }
        const groupNodes = new Map();
        for (const node of flatNodes.values()) {
            const groupId = this.eventGroupIdCallback(node.event);
            let groupNode = groupNodes.get(groupId);
            if (!groupNode) {
                groupNode = new GroupNode(groupId, this, node.events);
                groupNodes.set(groupId, groupNode);
            }
            else {
                groupNode.events.push(...node.events);
            }
            groupNode.addChild(node, node.selfTime, node.totalTime, node.transferSize);
        }
        this.childrenInternal = groupNodes;
        return groupNodes;
    }
    getEventGroupIdCallback() {
        return this.eventGroupIdCallback;
    }
}
export class BottomUpRootNode extends Node {
    childrenInternal;
    textFilter;
    filter;
    startTime;
    endTime;
    totalTime;
    eventGroupIdCallback;
    calculateTransferSize;
    forceGroupIdCallback;
    constructor(events, { textFilter, filters, startTime, endTime, eventGroupIdCallback, calculateTransferSize, forceGroupIdCallback, }) {
        super('', events[0]);
        this.childrenInternal = null;
        this.events = events;
        this.textFilter = textFilter;
        this.filter = (e) => filters.every(f => f.accept(e));
        this.startTime = startTime;
        this.endTime = endTime;
        this.eventGroupIdCallback = eventGroupIdCallback;
        this.totalTime = endTime - startTime;
        this.calculateTransferSize = calculateTransferSize;
        this.forceGroupIdCallback = forceGroupIdCallback;
    }
    hasChildren() {
        return true;
    }
    filterChildren(children) {
        for (const [id, child] of children) {
            // to provide better context to user only filter first (top) level.
            if (child.event && child.depth <= 1 && !this.textFilter.accept(child.event)) {
                children.delete((id));
            }
        }
        return children;
    }
    children() {
        // FYI tree nodes are built lazily. https://codereview.chromium.org/2674283003
        if (!this.childrenInternal) {
            this.childrenInternal = this.filterChildren(this.grouppedTopNodes());
        }
        return this.childrenInternal;
    }
    // If no grouping is applied, the nodes returned here are what's initially shown in the bottom-up view.
    // "No grouping" == no grouping in UI dropdown == no groupingFunction…
    // … HOWEVER, nodes are still aggregated via `generateEventID`, which is ~= the event name.
    ungroupedTopNodes() {
        const root = this;
        const startTime = this.startTime;
        const endTime = this.endTime;
        const idStack = [];
        const nodeById = new Map();
        const selfTimeStack = [endTime - startTime];
        const firstNodeStack = [];
        const totalTimeById = new Map();
        // TODO(paulirish): rename to getGroupNodeId
        const eventGroupIdCallback = this.eventGroupIdCallback;
        const forceGroupIdCallback = this.forceGroupIdCallback;
        const idToIsCacheHit = new Map();
        // Node IDs are cached so that every event with the same ID reuses one
        // string. Building a new ID string per event, and hashing it again on
        // each Map lookup, is a large part of the cost of this loop on big
        // traces.
        const profileCallIdByCallFrame = new Map();
        // Grouped IDs are looked up by ID and then by group ID, because keying a
        // flat Map by `${id}-${groupId}` would build a new string per event.
        const groupedIdsByEventId = new Map();
        const nodeIdForEvent = (e) => {
            let id;
            if (Types.Events.isProfileCall(e)) {
                // Profile calls for the same frame share one callFrame object, and
                // their ID only depends on its fields.
                const cachedId = profileCallIdByCallFrame.get(e.callFrame);
                if (cachedId === undefined) {
                    id = generateEventID(e);
                    profileCallIdByCallFrame.set(e.callFrame, id);
                }
                else {
                    id = cachedId;
                }
            }
            else {
                id = generateEventID(e);
            }
            if (!forceGroupIdCallback || !eventGroupIdCallback) {
                return id;
            }
            const groupId = eventGroupIdCallback(e);
            let groupedIds = groupedIdsByEventId.get(id);
            if (!groupedIds) {
                groupedIds = new Map();
                groupedIdsByEventId.set(id, groupedIds);
            }
            let groupedId = groupedIds.get(groupId);
            if (groupedId === undefined) {
                groupedId = `${id}-${groupId}`;
                groupedIds.set(groupId, groupedId);
            }
            return groupedId;
        };
        for (const e of this.events) {
            if (Types.Events.isReceivedDataEvent(e) && e.name === 'ResourceReceiveResponse') {
                idToIsCacheHit.set(nodeIdForEvent(e), e.args.data.fromCache || false);
            }
        }
        // encodedDataLength is provided solely on instant events.
        const sumTransferSizeOfInstantEvent = (e) => {
            if (Types.Events.isReceivedDataEvent(e)) {
                const id = nodeIdForEvent(e);
                let node = nodeById.get(id);
                if (!node) {
                    node = new BottomUpNode(root, id, e, false, root);
                    nodeById.set(id, node);
                }
                else {
                    node.events.push(e);
                }
                // ResourceReceivedData events tally up the transfer size over time, but the
                // ResourceReceiveResponse / ResourceFinish events hold the final result.
                if (e.name === 'ResourceReceivedData') {
                    if (idToIsCacheHit.get(id)) {
                        // It's a cache hit, so the actual network transfer size is 0.
                        // We overwrite the tallied sum (which is uncompressed body size) with 0.
                        node.transferSize = 0;
                    }
                    else {
                        node.transferSize += e.args.data.encodedDataLength;
                    }
                }
                else if (e.name === 'ResourceFinish' && e.args.data.encodedDataLength === 0 && idToIsCacheHit.get(id)) {
                    node.transferSize = 0;
                }
                else if (e.args.data.encodedDataLength > 0) {
                    // For some reason, ResourceFinish can be zero even if data was sent.
                    // Ignore that case.
                    // Note: this will count the entire resource size if just the last bit of a
                    // request is in view. If it isn't in view, the transfer size is counted
                    // gradually, in proportion with the ResourceReceivedData events in the
                    // current view.
                    node.transferSize = e.args.data.encodedDataLength;
                }
            }
        };
        Helpers.Trace.forEachEvent(this.events, {
            onStartEvent,
            onEndEvent,
            onInstantEvent: this.calculateTransferSize ? sumTransferSizeOfInstantEvent : undefined,
            startTime: Helpers.Timing.milliToMicro(this.startTime),
            endTime: Helpers.Timing.milliToMicro(this.endTime),
            eventFilter: this.filter,
            ignoreAsyncEvents: false,
        });
        function onStartEvent(e) {
            const { startTime: currentStartTime, endTime: currentEndTime } = Helpers.Timing.eventTimingsMilliSeconds(e);
            const actualEndTime = currentEndTime !== undefined ? Math.min(currentEndTime, endTime) : endTime;
            const duration = actualEndTime - Math.max(currentStartTime, startTime);
            selfTimeStack[selfTimeStack.length - 1] -= duration;
            selfTimeStack.push(duration);
            const id = nodeIdForEvent(e);
            idStack.push(id);
            // For an event 'X' that contains another event 'X' (resolving to the same node
            // id), we need to measure `totalTime` from the start of the outermost 'X' to
            // its corresponding end. This logic ensures we don't double-count the duration
            // of the inner event.
            const noNodeOnStack = !totalTimeById.has(id);
            if (noNodeOnStack) {
                totalTimeById.set(id, duration);
            }
            firstNodeStack.push(noNodeOnStack);
        }
        function onEndEvent(event) {
            const id = idStack.pop();
            if (id === undefined) {
                return;
            }
            let node = nodeById.get(id);
            if (!node) {
                node = new BottomUpNode(root, id, event, false, root);
                nodeById.set(id, node);
            }
            else {
                node.events.push(event);
            }
            node.selfTime += selfTimeStack.pop() || 0;
            if (firstNodeStack.pop()) {
                node.totalTime += totalTimeById.get(id) || 0;
                totalTimeById.delete(id);
            }
            // An item on this stack means that this current node has a caller. Therefore,
            // in a bottom-up view it has children.
            if (idStack.length > 0) {
                node.setHasChildren(true);
            }
        }
        this.selfTime = selfTimeStack.pop() || 0;
        // Delete any nodes that have no selfTime (or transferSize, if it's being calculated)
        for (const pair of nodeById) {
            if (pair[1].selfTime <= 0 && (!this.calculateTransferSize || pair[1].transferSize <= 0)) {
                nodeById.delete((pair[0]));
            }
        }
        return nodeById;
    }
    grouppedTopNodes() {
        const flatNodes = this.ungroupedTopNodes();
        if (!this.eventGroupIdCallback) {
            return flatNodes;
        }
        const groupNodes = new Map();
        for (const node of flatNodes.values()) {
            const groupId = this.eventGroupIdCallback(node.event);
            let groupNode = groupNodes.get(groupId);
            if (!groupNode) {
                groupNode = new GroupNode(groupId, this, node.events);
                groupNodes.set(groupId, groupNode);
            }
            else {
                for (const e of node.events) {
                    groupNode.events.push(e);
                }
            }
            groupNode.addChild(node, node.selfTime, node.selfTime, node.transferSize);
        }
        return groupNodes;
    }
}
export class GroupNode extends Node {
    childrenInternal;
    isGroupNodeInternal;
    events;
    constructor(id, parent, events) {
        super(id, events[0]);
        this.events = events;
        this.childrenInternal = new Map();
        this.parent = parent;
        this.isGroupNodeInternal = true;
    }
    addChild(child, selfTime, totalTime, transferSize) {
        this.childrenInternal.set(child.id, child);
        this.selfTime += selfTime;
        this.totalTime += totalTime;
        this.transferSize += transferSize;
        child.parent = this;
    }
    hasChildren() {
        return true;
    }
    children() {
        return this.childrenInternal;
    }
}
export class BottomUpNode extends Node {
    parent;
    root;
    depth;
    cachedChildren;
    hasChildrenInternal;
    constructor(root, id, event, hasChildren, parent) {
        super(id, event);
        this.parent = parent;
        this.root = root;
        this.depth = (parent.depth || 0) + 1;
        this.cachedChildren = null;
        this.hasChildrenInternal = hasChildren;
    }
    hasChildren() {
        return this.hasChildrenInternal;
    }
    setHasChildren(value) {
        this.hasChildrenInternal = value;
    }
    children() {
        if (this.cachedChildren) {
            return this.cachedChildren;
        }
        const selfTimeStack = [0];
        const eventIdStack = [];
        const eventStack = [];
        const nodeById = new Map();
        const startTime = this.root.startTime;
        const endTime = this.root.endTime;
        let lastTimeMarker = startTime;
        const self = this;
        Helpers.Trace.forEachEvent(this.root.events, {
            onStartEvent,
            onEndEvent,
            startTime: Helpers.Timing.milliToMicro(startTime),
            endTime: Helpers.Timing.milliToMicro(endTime),
            eventFilter: this.root.filter,
            ignoreAsyncEvents: false,
        });
        function onStartEvent(e) {
            const { startTime: currentStartTime, endTime: currentEndTime } = Helpers.Timing.eventTimingsMilliSeconds(e);
            const actualEndTime = currentEndTime !== undefined ? Math.min(currentEndTime, endTime) : endTime;
            const duration = actualEndTime - Math.max(currentStartTime, startTime);
            if (duration < 0) {
                console.assert(false, 'Negative duration of an event');
            }
            selfTimeStack[selfTimeStack.length - 1] -= duration;
            selfTimeStack.push(duration);
            const id = generateEventID(e);
            eventIdStack.push(id);
            eventStack.push(e);
        }
        function onEndEvent(e) {
            const { startTime: currentStartTime, endTime: currentEndTime } = Helpers.Timing.eventTimingsMilliSeconds(e);
            const selfTime = selfTimeStack.pop();
            const id = eventIdStack.pop();
            eventStack.pop();
            let node;
            for (node = self; node.depth > 1; node = node.parent) {
                if (node.id !== eventIdStack[eventIdStack.length + 1 - node.depth]) {
                    return;
                }
            }
            if (node.id !== id || eventIdStack.length < self.depth) {
                return;
            }
            const childId = eventIdStack[eventIdStack.length - self.depth];
            node = nodeById.get(childId);
            if (!node) {
                const event = eventStack[eventStack.length - self.depth];
                const hasChildren = eventStack.length > self.depth;
                node = new BottomUpNode(self.root, childId, event, hasChildren, self);
                nodeById.set(childId, node);
            }
            else {
                node.events.push(e);
            }
            const actualEndTime = currentEndTime !== undefined ? Math.min(currentEndTime, endTime) : endTime;
            const totalTime = actualEndTime - Math.max(currentStartTime, lastTimeMarker);
            node.selfTime += selfTime || 0;
            node.totalTime += totalTime;
            lastTimeMarker = actualEndTime;
        }
        this.cachedChildren = this.root.filterChildren(nodeById);
        return this.cachedChildren;
    }
    searchTree(matchFunction, results) {
        results = results || [];
        if (this.event && matchFunction(this.event)) {
            results.push(this);
        }
        return results;
    }
}
export function eventStackFrame(event) {
    if (Types.Events.isProfileCall(event)) {
        return event.callFrame;
    }
    const topFrame = Helpers.Trace.stackTraceInEvent(event)?.[0];
    if (!topFrame) {
        return null;
    }
    return { ...topFrame, scriptId: String(topFrame.scriptId) };
}
/** TODO(paulirish): rename to generateNodeId **/
export function generateEventID(event) {
    if (Types.Events.isProfileCall(event)) {
        const name = SamplesIntegrator.isNativeRuntimeFrame(event.callFrame) ?
            SamplesIntegrator.nativeGroup(event.callFrame.functionName) :
            event.callFrame.functionName;
        const location = event.callFrame.scriptId || event.callFrame.url || '';
        return `f:${name}@${location}:${event.callFrame.lineNumber}:${event.callFrame.columnNumber}`;
    }
    if (Types.Events.isConsoleTimeStamp(event) && event.args.data) {
        return `${event.name}:${event.args.data.name}`;
    }
    if (Types.Events.isSyntheticNetworkRequest(event) || Types.Events.isReceivedDataEvent(event)) {
        return `req:${event.args.data.requestId}`;
    }
    return event.name;
}
//# sourceMappingURL=TraceTree.js.map