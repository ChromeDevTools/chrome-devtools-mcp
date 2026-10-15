// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Trace from '../../../models/trace/trace.js';
import * as SourceMapsResolver from '../../../models/trace_source_maps_resolver/trace_source_maps_resolver.js';
import * as Workspace from '../../../models/workspace/workspace.js';
/** Iterates from a node down through its descendents. If the callback returns true, the loop stops. */
function depthFirstWalk(nodes, callback) {
    for (const node of nodes) {
        if (callback?.(node)) {
            break;
        }
        depthFirstWalk(node.children().values(), callback); // Go deeper.
    }
}
export class AICallTree {
    selectedNode;
    rootNode;
    parsedTrace;
    workspace;
    // Note: ideally this is passed in (or lived on ParsedTrace), but this class is
    // stateless (mostly, there's a cache for some stuff) so it doesn't match much.
    #eventsSerializer = new Trace.EventsSerializer.EventsSerializer();
    constructor(selectedNode, rootNode, parsedTrace, 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    workspace = Workspace.Workspace.WorkspaceImpl.instance()) {
        this.selectedNode = selectedNode;
        this.rootNode = rootNode;
        this.parsedTrace = parsedTrace;
        this.workspace = workspace;
    }
    static findEventsForThread({ thread, parsedTrace, bounds }) {
        const threadEvents = parsedTrace.data.Renderer.processes.get(thread.pid)?.threads.get(thread.tid)?.entries;
        if (!threadEvents) {
            return null;
        }
        return threadEvents.filter(e => Trace.Helpers.Timing.eventIsInBounds(e, bounds));
    }
    static findMainThreadTasks({ thread, parsedTrace, bounds }) {
        const threadEvents = parsedTrace.data.Renderer.processes.get(thread.pid)?.threads.get(thread.tid)?.entries;
        if (!threadEvents) {
            return null;
        }
        return threadEvents.filter(Trace.Types.Events.isRunTask)
            .filter(e => Trace.Helpers.Timing.eventIsInBounds(e, bounds));
    }
    /**
     * Builds a call tree representing all calls within the given timeframe for
     * the provided thread.
     * Events that are less than 0.05% of the range duration are removed.
     */
    static fromTimeOnThread({ thread, parsedTrace, bounds }) {
        const overlappingEvents = this.findEventsForThread({ thread, parsedTrace, bounds });
        if (!overlappingEvents) {
            return null;
        }
        const visibleEventsFilter = new Trace.Extras.TraceFilter.VisibleEventsFilter(Trace.Styles.visibleTypes());
        // By default, we remove events whose duration is less than 0.5% of the total
        // range. So if the range is 10s, an event must be 0.05s+ to be included.
        // This does risk eliminating useful data when we pass it to the LLM, but
        // we are trying to balance context window sizes and not using it up too
        // eagerly. We will experiment with this filter and likely make it smarter
        // or tweak it based on range size rather than using a blanket value. Or we
        // could consider limiting the depth when we serialize. Or some
        // combination!
        const minDuration = Trace.Types.Timing.Micro(bounds.range * 0.005);
        const minDurationFilter = new MinDurationFilter(minDuration);
        const compileCodeFilter = new ExcludeCompileCodeFilter();
        // Build a tree bounded by the selected event's timestamps, and our other filters applied
        const rootNode = new Trace.Extras.TraceTree.TopDownRootNode(overlappingEvents, {
            filters: [minDurationFilter, compileCodeFilter, visibleEventsFilter],
            startTime: Trace.Helpers.Timing.microToMilli(bounds.min),
            endTime: Trace.Helpers.Timing.microToMilli(bounds.max),
            doNotAggregate: true,
            includeInstantEvents: true,
        });
        const instance = new AICallTree(null /* no selected node*/, rootNode, parsedTrace);
        return instance;
    }
    /**
     * Attempts to build an AICallTree from a given selected event. It also
     * validates that this event is one that we support being used with the AI
     * Assistance panel, which [as of January 2025] means:
     * 1. It is on the main thread.
     * 2. It exists in either the Renderer or Sample handler's entryToNode map.
     * This filters out other events we make such as SyntheticLayoutShifts which are not valid
     * If the event is not valid, or there is an unexpected error building the tree, `null` is returned.
     */
    static fromEvent(selectedEvent, parsedTrace) {
        // Special case: performance.mark events are shown on the main thread
        // technically, but because they are instant events they are shown with a
        // tiny duration. Because they are instant, they also don't have any
        // children or a call tree, and so if the user has selected a performance
        // mark in the timings track, we do not want to attempt to build a call
        // tree. Context: crbug.com/418223469
        // Note that we do not have to repeat this check for performance.measure
        // events because those are synthetic, and therefore the check
        // further down about if this event is known to the RenderHandler
        // deals with this.
        if (Trace.Types.Events.isPerformanceMark(selectedEvent)) {
            return null;
        }
        // First: check that the selected event is on the thread we have identified as the main thread.
        const threads = Trace.Handlers.Threads.threadsInTrace(parsedTrace.data);
        const thread = threads.find(t => t.pid === selectedEvent.pid && t.tid === selectedEvent.tid);
        if (!thread) {
            return null;
        }
        // We allow two thread types to deal with the NodeJS use case.
        // MAIN_THREAD is used when a trace has been generated through Chrome
        //   tracing on a website (and we have a renderer)
        // CPU_PROFILE is used only when we have received a CPUProfile - in this
        //   case all the threads are CPU_PROFILE so we allow those. If we only allow
        //   MAIN_THREAD then we wouldn't ever allow NodeJS users to use the AI
        //   integration.
        if (thread.type !== Trace.Handlers.Threads.ThreadType.MAIN_THREAD &&
            thread.type !== Trace.Handlers.Threads.ThreadType.CPU_PROFILE) {
            return null;
        }
        // Ensure that the event is known to either the Renderer or Samples
        // handler. This helps exclude synthetic events we build up for other
        // information such as Layout Shift clusters.
        // We check Renderer + Samples to ensure we support CPU Profiles (which do
        // not populate the Renderer Handler)
        const data = parsedTrace.data;
        if (!data.Renderer.entryToNode.has(selectedEvent) && !data.Samples.entryToNode.has(selectedEvent)) {
            return null;
        }
        const showAllEvents = parsedTrace.data.Meta.config.showAllEvents;
        const { startTime, endTime } = Trace.Helpers.Timing.eventTimingsMilliSeconds(selectedEvent);
        const selectedEventBounds = Trace.Helpers.Timing.traceWindowFromMicroSeconds(Trace.Helpers.Timing.milliToMicro(startTime), Trace.Helpers.Timing.milliToMicro(endTime));
        let threadEvents = data.Renderer.processes.get(selectedEvent.pid)?.threads.get(selectedEvent.tid)?.entries;
        if (!threadEvents) {
            // None from the renderer: try the samples handler, this might be a CPU trace.
            threadEvents = data.Samples.profilesInProcess.get(selectedEvent.pid)?.get(selectedEvent.tid)?.profileCalls;
        }
        if (!threadEvents) {
            console.warn(`AICallTree: could not find thread for selected entry: ${selectedEvent}`);
            return null;
        }
        const overlappingEvents = threadEvents.filter(e => Trace.Helpers.Timing.eventIsInBounds(e, selectedEventBounds));
        const filters = [new SelectedEventDurationFilter(selectedEvent), new ExcludeCompileCodeFilter(selectedEvent)];
        // If the "Show all events" experiment is on, we don't filter out any
        // events here, otherwise the generated call tree will not match what the
        // user is seeing.
        if (!showAllEvents) {
            filters.push(new Trace.Extras.TraceFilter.VisibleEventsFilter(Trace.Styles.visibleTypes()));
        }
        // Build a tree bounded by the selected event's timestamps, and our other filters applied
        const rootNode = new Trace.Extras.TraceTree.TopDownRootNode(overlappingEvents, {
            filters,
            startTime,
            endTime,
            includeInstantEvents: true,
        });
        // Walk the tree to find selectedNode
        let selectedNode = null;
        depthFirstWalk([rootNode].values(), node => {
            if (node.event === selectedEvent) {
                selectedNode = node;
                return true;
            }
            return;
        });
        if (selectedNode === null) {
            console.warn(`Selected event ${selectedEvent} not found within its own tree.`);
            return null;
        }
        const instance = new AICallTree(selectedNode, rootNode, parsedTrace);
        // instance.logDebug();
        return instance;
    }
    /**
     * Iterates through nodes level by level using a Breadth-First Search (BFS) algorithm.
     * BFS is important here because the serialization process assumes that direct child nodes
     * will have consecutive IDs (horizontally across each depth).
     *
     * Example tree with IDs:
     *
     *             1
     *            / \
     *           2   3
     *        / / /   \
     *      4  5 6     7
     *
     * Here, node with an ID 2 has consecutive children in the 4-6 range.
     *
     * To optimize for space, the provided `callback` function is called to serialize
     * each node as it's visited during the BFS traversal.
     *
     * When serializing a node, the callback receives:
     * 1. The current node being visited.
     * 2. The ID assigned to this current node (a simple incrementing index based on visit order).
     * 3. The predicted starting ID for the children of this current node.
     *
     * A serialized node needs to know the ID range of its children. However,
     * child node IDs are only assigned when those children are themselves visited.
     * To handle this, we predict the starting ID for a node's children. This prediction
     * is based on a running count of all nodes that have ever been added to the BFS queue.
     * Since IDs are assigned consecutively as nodes are processed from the queue, and a
     * node's children are added to the end of the queue when the parent is visited,
     * their eventual IDs will follow this running count.
     */
    breadthFirstWalk(nodes, serializeNodeCallback) {
        const queue = Array.from(nodes);
        let nodeIndex = 1;
        // To predict the visited children indexes
        let nodesAddedToQueueCount = queue.length;
        let currentNode = queue.shift();
        while (currentNode) {
            if (currentNode.children().size > 0) {
                serializeNodeCallback(currentNode, nodeIndex, nodesAddedToQueueCount + 1);
            }
            else {
                serializeNodeCallback(currentNode, nodeIndex);
            }
            queue.push(...Array.from(currentNode.children().values()));
            nodesAddedToQueueCount += currentNode.children().size;
            currentNode = queue.shift();
            nodeIndex++;
        }
    }
    serialize(headerLevel = 1) {
        const header = '#'.repeat(headerLevel);
        // Keep a map of URLs. We'll output a LUT to keep size down.
        const allUrls = [];
        let nodesStr = '';
        this.breadthFirstWalk(this.rootNode.children().values(), (node, nodeId, childStartingNode) => {
            nodesStr +=
                '\n' + this.stringifyNode(node, nodeId, this.parsedTrace, this.selectedNode, allUrls, childStartingNode);
        });
        let output = '';
        if (allUrls.length) {
            // Output lookup table of URLs within this tree
            output += `\n${header} All URLs:\n\n` + allUrls.map((url, index) => `  * ${index}: ${url}`).join('\n');
        }
        output += `\n\n${header} Call tree:\n${nodesStr}`;
        return output;
    }
    /*
    * Each node is serialized into a single line to minimize token usage in the context window.
    * The format is a semicolon-separated string with the following fields:
    * Format: `id;name;duration;selfTime;urlIndex;childRange;[S]
    *
    *   1. `id`: A unique numerical identifier for the node assigned by BFS.
    *   2. `name`: The name of the event represented by the node.
    *   3. `duration`: The total duration of the event in milliseconds, rounded to one decimal place.
    *   4. `selfTime`: The self time of the event in milliseconds, rounded to one decimal place.
    *   5. `urlIndex`: An index referencing a URL in the `allUrls` array. If no URL is present, this is an empty string.
    *   6. `childRange`: A string indicating the range of IDs for the node's children. Children should always have consecutive IDs.
    *                    If there is only one child, it's a single ID.
    *   7. `[line]`: An optional field for a call frame's line number.
    *   8. `[column]`: An optional field for a call frame's column number.
    *   9. `[S]`: An optional marker indicating that this node is the selected node.
    *
    * Example:
    *   `1;Parse HTML;2.5;0.3;0;2-5;10;11;S`
    *   This represents:
    *     - Node ID 1
    *     - Name "Parse HTML"
    *     - Total duration of 2.5ms
    *     - Self time of 0.3ms
    *     - URL index 0 (meaning the URL is the first one in the `allUrls` array)
    *     - Child range of IDs 2 to 5
    *     - Line, column is 10:11
    *     - This node is the selected node (S marker)
    */
    stringifyNode(node, nodeId, parsedTrace, selectedNode, allUrls, childStartingNodeIndex) {
        const event = node.event;
        if (!event) {
            throw new Error('Event required');
        }
        // 1. ID
        const idStr = String(nodeId);
        // 2. eventKey
        const eventKey = this.#eventsSerializer.keyForEvent(node.event);
        // 3. Name
        const name = Trace.Name.forEntry(event, parsedTrace);
        // Round milliseconds to one decimal place, return empty string if zero/undefined
        const roundToTenths = (num) => {
            if (!num) {
                return '';
            }
            return String(Math.round(num * 10) / 10);
        };
        // 4. Duration
        const durationStr = roundToTenths(node.totalTime);
        // 5. Self Time
        const selfTimeStr = roundToTenths(node.selfTime);
        // 6. URL Index
        const location = SourceMapsResolver.SourceMapsResolver.codeLocationForEntry(parsedTrace, event, this.workspace);
        const url = location?.url;
        let urlIndexStr = '';
        if (url) {
            const existingIndex = allUrls.indexOf(url);
            if (existingIndex === -1) {
                urlIndexStr = String(allUrls.push(url) - 1);
            }
            else {
                urlIndexStr = String(existingIndex);
            }
        }
        // 7. Child Range
        const children = Array.from(node.children().values());
        let childRangeStr = '';
        if (childStartingNodeIndex) {
            childRangeStr = (children.length === 1) ? String(childStartingNodeIndex) :
                `${childStartingNodeIndex}-${childStartingNodeIndex + children.length}`;
        }
        // 8. Selected Marker
        const selectedMarker = selectedNode?.event === node.event ? 'S' : '';
        // Combine fields
        let line = idStr;
        line += ';' + eventKey;
        line += ';' + name;
        line += ';' + durationStr;
        line += ';' + selfTimeStr;
        line += ';' + urlIndexStr;
        line += ';' + childRangeStr;
        line += ';' + (location?.line ?? '');
        line += ';' + (location?.column ?? '');
        if (selectedMarker) {
            line += ';' + selectedMarker;
        }
        return line;
    }
    topCallFramesBySelfTime(limit) {
        const functionNodesByCallFrame = new Map();
        this.breadthFirstWalk(this.rootNode.children().values(), node => {
            if (Trace.Types.Events.isProfileCall(node.event)) {
                const callFrame = node.event.callFrame;
                const callFrameKey = `${callFrame.scriptId}:${callFrame.lineNumber}:${callFrame.columnNumber}`;
                const array = functionNodesByCallFrame.get(callFrameKey) ?? [];
                array.push(node);
                functionNodesByCallFrame.set(callFrameKey, array);
            }
        });
        return [...functionNodesByCallFrame.values()]
            .map(nodes => {
            return {
                callFrame: nodes[0].event.callFrame,
                selfTime: nodes.reduce((total, cur) => total + cur.selfTime, 0),
            };
        })
            .sort((a, b) => b.selfTime - a.selfTime)
            .slice(0, limit)
            .map(({ callFrame }) => callFrame);
    }
    topCallFrameByTotalTime() {
        let topChild = null;
        let topProfileCallEvent = null;
        for (const child of this.rootNode.children().values()) {
            if (Trace.Types.Events.isProfileCall(child.event)) {
                if (!topChild || child.totalTime > topChild.totalTime) {
                    topChild = child;
                    topProfileCallEvent = child.event;
                }
            }
        }
        return topProfileCallEvent?.callFrame ?? null;
    }
    // Only used for debugging.
    logDebug() {
        const str = this.serialize();
        // eslint-disable-next-line no-console
        console.log('🎆', str);
        if (str.length > 45_000) {
            // Manual testing shows 45k fits. 50k doesn't.
            // Max is 32k _tokens_, but tokens to bytes is wishywashy, so... hard to know for sure.
            console.warn('Output will likely not fit in the context window. Expect an AIDA error.');
        }
    }
}
/**
 * These events are very noisy and take up room in the context window for no real benefit.
 */
export class ExcludeCompileCodeFilter extends Trace.Extras.TraceFilter.TraceFilter {
    #selectedEvent = null;
    constructor(selectedEvent) {
        super();
        this.#selectedEvent = selectedEvent ?? null;
    }
    accept(event) {
        if (this.#selectedEvent && event === this.#selectedEvent) {
            // If the user selects this event, we should accept it, else the
            // behaviour is confusing when the selected event is not used.
            return true;
        }
        return event.name !== Trace.Types.Events.Name.COMPILE_CODE;
    }
}
export class SelectedEventDurationFilter extends Trace.Extras.TraceFilter.TraceFilter {
    #minDuration;
    #selectedEvent;
    constructor(selectedEvent) {
        super();
        // The larger the selected event is, the less small ones matter. We'll exclude items under ½% of the selected event's size
        this.#minDuration = Trace.Types.Timing.Micro((selectedEvent.dur ?? 1) * 0.005);
        this.#selectedEvent = selectedEvent;
    }
    accept(event) {
        if (event === this.#selectedEvent) {
            return true;
        }
        return event.dur ? event.dur >= this.#minDuration : false;
    }
}
export class MinDurationFilter extends Trace.Extras.TraceFilter.TraceFilter {
    #minDuration;
    constructor(minDuration) {
        super();
        this.#minDuration = minDuration;
    }
    accept(event) {
        return event.dur ? event.dur >= this.#minDuration : false;
    }
}
//# sourceMappingURL=AICallTree.js.map