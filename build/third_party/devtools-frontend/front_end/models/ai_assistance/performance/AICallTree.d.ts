import type * as Protocol from '../../../generated/protocol.js';
import * as Trace from '../../../models/trace/trace.js';
import * as Workspace from '../../../models/workspace/workspace.js';
export interface FromTimeOnThreadOptions {
    thread: {
        pid: Trace.Types.Events.ProcessID;
        tid: Trace.Types.Events.ThreadID;
    };
    parsedTrace: Trace.TraceModel.ParsedTrace;
    bounds: Trace.Types.Timing.TraceWindowMicro;
}
export declare class AICallTree {
    #private;
    selectedNode: Trace.Extras.TraceTree.Node | null;
    rootNode: Trace.Extras.TraceTree.TopDownRootNode;
    parsedTrace: Trace.TraceModel.ParsedTrace;
    workspace: Workspace.Workspace.WorkspaceImpl;
    constructor(selectedNode: Trace.Extras.TraceTree.Node | null, rootNode: Trace.Extras.TraceTree.TopDownRootNode, parsedTrace: Trace.TraceModel.ParsedTrace, workspace?: Workspace.Workspace.WorkspaceImpl);
    static findEventsForThread({ thread, parsedTrace, bounds }: FromTimeOnThreadOptions): Trace.Types.Events.Event[] | null;
    static findMainThreadTasks({ thread, parsedTrace, bounds }: FromTimeOnThreadOptions): Trace.Types.Events.RunTask[] | null;
    /**
     * Builds a call tree representing all calls within the given timeframe for
     * the provided thread.
     * Events that are less than 0.05% of the range duration are removed.
     */
    static fromTimeOnThread({ thread, parsedTrace, bounds }: FromTimeOnThreadOptions): AICallTree | null;
    /**
     * Attempts to build an AICallTree from a given selected event. It also
     * validates that this event is one that we support being used with the AI
     * Assistance panel, which [as of January 2025] means:
     * 1. It is on the main thread.
     * 2. It exists in either the Renderer or Sample handler's entryToNode map.
     * This filters out other events we make such as SyntheticLayoutShifts which are not valid
     * If the event is not valid, or there is an unexpected error building the tree, `null` is returned.
     */
    static fromEvent(selectedEvent: Trace.Types.Events.Event, parsedTrace: Trace.TraceModel.ParsedTrace): AICallTree | null;
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
    breadthFirstWalk(nodes: MapIterator<Trace.Extras.TraceTree.Node>, serializeNodeCallback: (currentNode: Trace.Extras.TraceTree.Node, nodeId: number, childrenStartingId?: number) => void): void;
    serialize(headerLevel?: number): string;
    stringifyNode(node: Trace.Extras.TraceTree.Node, nodeId: number, parsedTrace: Trace.TraceModel.ParsedTrace, selectedNode: Trace.Extras.TraceTree.Node | null, allUrls: string[], childStartingNodeIndex?: number): string;
    topCallFramesBySelfTime(limit: number): Protocol.Runtime.CallFrame[];
    topCallFrameByTotalTime(): Protocol.Runtime.CallFrame | null;
    logDebug(): void;
}
/**
 * These events are very noisy and take up room in the context window for no real benefit.
 */
export declare class ExcludeCompileCodeFilter extends Trace.Extras.TraceFilter.TraceFilter {
    #private;
    constructor(selectedEvent?: Trace.Types.Events.Event);
    accept(event: Trace.Types.Events.Event): boolean;
}
export declare class SelectedEventDurationFilter extends Trace.Extras.TraceFilter.TraceFilter {
    #private;
    constructor(selectedEvent: Trace.Types.Events.Event);
    accept(event: Trace.Types.Events.Event): boolean;
}
export declare class MinDurationFilter extends Trace.Extras.TraceFilter.TraceFilter {
    #private;
    constructor(minDuration: Trace.Types.Timing.Micro);
    accept(event: Trace.Types.Events.Event): boolean;
}
