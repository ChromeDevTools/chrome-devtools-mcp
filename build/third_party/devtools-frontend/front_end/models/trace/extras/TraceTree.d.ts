import type * as Protocol from '../../../generated/protocol.js';
import * as Types from '../types/types.js';
import type { TraceFilter } from './TraceFilter.js';
export declare class Node {
    /** ms */
    totalTime: number;
    /** ms */
    selfTime: number;
    transferSize: number;
    id: string | symbol;
    /** The first trace event encountered that necessitated the creation of this tree node. */
    event: Types.Events.Event;
    /**
     * All of the trace events associated with this aggregate node.
     * Minor: In the case of Event Log (EventsTimelineTreeView), the node is not aggregate and this will only hold 1 event, the same that's in this.event
     */
    events: Types.Events.Event[];
    parent: Node | null;
    groupId: string;
    isGroupNodeInternal: boolean;
    depth: number;
    constructor(id: string | symbol, event: Types.Events.Event);
    isGroupNode(): boolean;
    hasChildren(): boolean;
    setHasChildren(_value: boolean): void;
    /**
     * Returns the direct descendants of this node.
     * @returns a map with ordered <nodeId, Node> tuples.
     */
    children(): ChildrenCache;
    searchTree(matchFunction: (arg0: Types.Events.Event) => boolean, results?: Node[]): Node[];
}
export declare class TopDownNode extends Node {
    root: TopDownRootNode | null;
    private hasChildrenInternal;
    childrenInternal: ChildrenCache | null;
    parent: TopDownNode | null;
    constructor(id: string | symbol, event: Types.Events.Event, parent: TopDownNode | null);
    hasChildren(): boolean;
    setHasChildren(value: boolean): void;
    children(): ChildrenCache;
    private buildChildren;
}
export declare class TopDownRootNode extends TopDownNode {
    readonly filter: (e: Types.Events.Event) => boolean;
    readonly startTime: Types.Timing.Milli;
    readonly endTime: Types.Timing.Milli;
    eventGroupIdCallback: ((arg0: Types.Events.Event) => string) | null | undefined;
    /** Default behavior is to aggregate similar trace events into one Node based on generateEventID(), eventGroupIdCallback(), etc. Set true to keep nodes 1:1 with events. */
    readonly doNotAggregate: boolean | undefined;
    readonly includeInstantEvents?: boolean;
    totalTime: number;
    selfTime: number;
    constructor(events: Types.Events.Event[], { filters, startTime, endTime, doNotAggregate, eventGroupIdCallback, includeInstantEvents }: {
        filters: TraceFilter[];
        startTime: Types.Timing.Milli;
        endTime: Types.Timing.Milli;
        doNotAggregate?: boolean;
        eventGroupIdCallback?: ((arg0: Types.Events.Event) => string) | null;
        includeInstantEvents?: boolean;
    });
    children(): ChildrenCache;
    private grouppedTopNodes;
    getEventGroupIdCallback(): ((arg0: Types.Events.Event) => string) | null | undefined;
}
export declare class BottomUpRootNode extends Node {
    private childrenInternal;
    private textFilter;
    readonly filter: (e: Types.Events.Event) => boolean;
    readonly startTime: Types.Timing.Milli;
    readonly endTime: Types.Timing.Milli;
    totalTime: number;
    eventGroupIdCallback: ((arg0: Types.Events.Event) => string) | null | undefined;
    private calculateTransferSize?;
    private forceGroupIdCallback?;
    constructor(events: Types.Events.Event[], { textFilter, filters, startTime, endTime, eventGroupIdCallback, calculateTransferSize, forceGroupIdCallback, }: {
        textFilter: TraceFilter;
        filters: readonly TraceFilter[];
        startTime: Types.Timing.Milli;
        endTime: Types.Timing.Milli;
        eventGroupIdCallback?: ((arg0: Types.Events.Event) => string) | null;
        calculateTransferSize?: boolean;
        /**
         * This forces using `eventGroupIdCallback` in combination with generateEventID
         * to generate the ID of the node.
         *
         * This is used in the ThirdPartyTreeView and BottomUpTreeView, where we want to group all events
         * related to a specific 3P entity together, regardless of the specific event name/type.
         * There are cases where events under the same event name belong to different entities. But, because
         * they get grouped first by event name/type, it throws off the 3P groupBy - grouping events of different
         * 3P entities together.
         */
        forceGroupIdCallback?: boolean;
    });
    hasChildren(): boolean;
    filterChildren(children: ChildrenCache): ChildrenCache;
    children(): ChildrenCache;
    private ungroupedTopNodes;
    private grouppedTopNodes;
}
export declare class GroupNode extends Node {
    private readonly childrenInternal;
    isGroupNodeInternal: boolean;
    events: Types.Events.Event[];
    constructor(id: string, parent: BottomUpRootNode | TopDownRootNode, events: Types.Events.Event[]);
    addChild(child: BottomUpNode, selfTime: number, totalTime: number, transferSize: number): void;
    hasChildren(): boolean;
    children(): ChildrenCache;
}
export declare class BottomUpNode extends Node {
    parent: Node;
    private root;
    depth: number;
    private cachedChildren;
    private hasChildrenInternal;
    constructor(root: BottomUpRootNode, id: string, event: Types.Events.Event, hasChildren: boolean, parent: Node);
    hasChildren(): boolean;
    setHasChildren(value: boolean): void;
    children(): ChildrenCache;
    searchTree(matchFunction: (arg0: Types.Events.Event) => boolean, results?: Node[]): Node[];
}
export declare function eventStackFrame(event: Types.Events.Event): Protocol.Runtime.CallFrame | null;
/** TODO(paulirish): rename to generateNodeId **/
export declare function generateEventID(event: Types.Events.Event): string;
export type ChildrenCache = Map<string | symbol, Node>;
