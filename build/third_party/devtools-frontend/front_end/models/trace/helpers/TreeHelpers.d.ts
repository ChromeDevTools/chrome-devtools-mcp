import type * as Platform from '../../../core/platform/platform.js';
import * as Types from '../types/types.js';
export declare const makeTraceEntryNodeId: () => TraceEntryNodeId;
export declare const makeEmptyTraceEntryTree: () => TraceEntryTree;
export declare const makeEmptyTraceEntryNode: (entry: Types.Events.Event, id: TraceEntryNodeId) => TraceEntryNode;
export interface TraceEntryTree {
    roots: Set<TraceEntryNode>;
    maxDepth: number;
}
/** Node in the graph that defines all parent/child relationships. */
export interface TraceEntryNode {
    entry: Types.Events.Event;
    depth: number;
    selfTime?: Types.Timing.Micro;
    id: TraceEntryNodeId;
    parent: TraceEntryNode | null;
    children: TraceEntryNode[];
}
export type TraceEntryNodeId = Platform.Brand.Brand<number, 'traceEntryNodeIdTag'>;
/**
 * Builds a hierarchy of the entries (trace events and profile calls) in
 * a particular thread of a particular process, assuming that they're
 * sorted, by iterating through all of the events in order.
 *
 * The approach is analogous to how a parser would be implemented. A
 * stack maintains local context. A scanner peeks and pops from the data
 * stream. Various "tokens" (events) are treated as "whitespace"
 * (ignored).
 *
 * The tree starts out empty and is populated as the hierarchy is built.
 * The nodes are also assumed to be created empty, with no known parent
 * or children.
 *
 * Complexity: O(n), where n = number of events
 */
export declare function treify(entries: readonly Types.Events.Event[], options?: {
    filter: {
        has: (name: Types.Events.Name) => boolean;
    };
}): {
    tree: TraceEntryTree;
    entryToNode: Map<Types.Events.Event, TraceEntryNode>;
};
/**
 * Iterates events in a tree hierarchically, from top to bottom,
 * calling back on every event's start and end in the order
 * as it traverses down and then up the tree.
 *
 * For example, given this tree, the following callbacks
 * are expected to be made in the following order
 * |---------------A---------------|
 *  |------B------||-------D------|
 *    |---C---|
 *
 * 1. Start A
 * 3. Start B
 * 4. Start C
 * 5. End C
 * 6. End B
 * 7. Start D
 * 8. End D
 * 9. End A
 *
 */
export declare function walkTreeFromEntry(entryToNode: Map<Types.Events.Event, TraceEntryNode>, rootEntry: Types.Events.Event, onEntryStart: (entry: Types.Events.Event) => void, onEntryEnd: (entry: Types.Events.Event) => void): void;
/**
 * Given a Helpers.TreeHelpers.RendererTree, this will iterates events in hierarchically, visiting
 * each root node and working from top to bottom, calling back on every event's
 * start and end in the order as it traverses down and then up the tree.
 *
 * For example, given this tree, the following callbacks
 * are expected to be made in the following order
 * |------------- Task A -------------||-- Task E --|
 *  |-- Task B --||-- Task D --|
 *   |- Task C -|
 *
 * 1. Start A
 * 3. Start B
 * 4. Start C
 * 5. End C
 * 6. End B
 * 7. Start D
 * 8. End D
 * 9. End A
 * 10. Start E
 * 11. End E
 *
 */
export declare function walkEntireTree(entryToNode: Map<Types.Events.Event, TraceEntryNode>, tree: TraceEntryTree, onEntryStart: (entry: Types.Events.Event) => void, onEntryEnd: (entry: Types.Events.Event) => void, traceWindowToInclude?: Types.Timing.TraceWindowMicro, minDuration?: Types.Timing.Micro): void;
/**
 * Determines if the given events, which are assumed to be ordered can
 * be organized into tree structures.
 * This condition is met if there is *not* a pair of async events
 * e1 and e2 where:
 *
 * e1.startTime < e2.startTime && e1.endTime > e2.startTime && e1.endTime < e2.endTime.
 * or, graphically:
 * |------- e1 ------|
 *   |------- e2 --------|
 *
 * Because a parent-child relationship cannot be made from the example
 * above, a tree cannot be made from the set of events.
 *
 * Sync events from the same thread are tree-able by definition.
 *
 * Note that this will also return true if multiple trees can be
 * built, for example if none of the events overlap with each other.
 */
export declare function canBuildTreesFromEvents(events: readonly Types.Events.Event[]): boolean;
