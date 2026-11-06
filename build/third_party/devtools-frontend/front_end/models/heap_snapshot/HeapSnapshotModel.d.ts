export declare const HeapSnapshotProgressEvent: {
    Update: string;
    BrokenSnapshot: string;
};
export declare const baseSystemDistance = 100000000;
export declare const baseUnreachableDistance: number;
export declare class AllocationNodeCallers {
    nodesWithSingleCaller: SerializedAllocationNode[];
    branchingCallers: SerializedAllocationNode[];
    constructor(nodesWithSingleCaller: SerializedAllocationNode[], branchingCallers: SerializedAllocationNode[]);
}
export declare class SerializedAllocationNode {
    id: number;
    name: string;
    scriptName: string;
    scriptId: number;
    line: number;
    column: number;
    count: number;
    size: number;
    liveCount: number;
    liveSize: number;
    hasChildren: boolean;
    constructor(nodeId: number, functionName: string, scriptName: string, scriptId: number, line: number, column: number, count: number, size: number, liveCount: number, liveSize: number, hasChildren: boolean);
}
export declare class AllocationStackFrame {
    functionName: string;
    scriptName: string;
    scriptId: number;
    line: number;
    column: number;
    constructor(functionName: string, scriptName: string, scriptId: number, line: number, column: number);
}
export declare class Node {
    id: number;
    name: string;
    distance: number;
    nodeIndex: number;
    retainedSize: number;
    selfSize: number;
    type: string;
    canBeQueried: boolean;
    detachedDOMTreeNode: boolean;
    isAddedNotRemoved: boolean | null;
    ignored: boolean;
    constructor(id: number, name: string, distance: number, nodeIndex: number, retainedSize: number, selfSize: number, type: string);
}
export declare class Edge {
    name: string;
    node: Node;
    type: string;
    edgeIndex: number;
    isAddedNotRemoved: boolean | null;
    constructor(name: string, node: Node, type: string, edgeIndex: number);
}
export interface AggregatedInfo {
    count: number;
    distance: number;
    self: number;
    maxRet: number;
    name: string;
    idxs: number[];
}
export declare class AggregateForDiff {
    name: string;
    indexes: number[];
    ids: number[];
    selfSizes: number[];
    constructor();
}
export declare class Diff {
    name: string;
    addedCount: number;
    removedCount: number;
    addedSize: number;
    removedSize: number;
    countDelta: number;
    sizeDelta: number;
    addedIndexes: number[];
    addedIds: number[];
    addedSelfSizes: number[];
    deletedIndexes: number[];
    deletedIds: number[];
    deletedSelfSizes: number[];
    constructor(name: string);
}
export declare class ComparatorConfig {
    fieldName1: string;
    ascending1: boolean;
    fieldName2: string;
    ascending2: boolean;
    constructor(fieldName1: string, ascending1: boolean, fieldName2: string, ascending2: boolean);
}
export interface WorkerCommand {
    callId: number;
    disposition: string;
    objectId: number;
    newObjectId: number;
    methodName: string;
    methodArguments: any[];
    source: string;
}
export declare class ItemsRange {
    startPosition: number;
    endPosition: number;
    totalLength: number;
    items: Array<Node | Edge>;
    constructor(startPosition: number, endPosition: number, totalLength: number, items: Array<Node | Edge>);
}
export declare class StaticData {
    nodeCount: number;
    rootNodeIndex: number;
    totalSize: number;
    maxJSObjectId: number;
    constructor(nodeCount: number, rootNodeIndex: number, totalSize: number, maxJSObjectId: number);
}
export interface Statistics {
    total: number;
    native: {
        total: number;
        typedArrays: number;
    };
    v8heap: {
        total: number;
        code: number;
        jsArrays: number;
        strings: number;
        system: number;
    };
}
export declare class NodeFilter {
    minNodeId: number | undefined;
    maxNodeId: number | undefined;
    allocationNodeId: number | undefined;
    filterName: string | undefined;
    constructor(minNodeId?: number, maxNodeId?: number);
    equals(o: NodeFilter): boolean;
}
export declare class SearchConfig {
    query: string;
    caseSensitive: boolean;
    wholeWord: boolean;
    isRegex: boolean;
    shouldJump: boolean;
    jumpBackward: boolean;
    constructor(query: string, caseSensitive: boolean, wholeWord: boolean, isRegex: boolean, shouldJump: boolean, jumpBackward: boolean);
    toSearchRegex(_global?: boolean): {
        regex: RegExp;
        fromQuery: boolean;
    };
}
export declare class Samples {
    timestamps: number[];
    lastAssignedIds: number[];
    sizes: number[];
    constructor(timestamps: number[], lastAssignedIds: number[], sizes: number[]);
}
export declare class Location {
    scriptId: number;
    lineNumber: number;
    columnNumber: number;
    constructor(scriptId: number, lineNumber: number, columnNumber: number);
}
export interface RetainingEdge {
    edgeIndex: number;
    edgeName: string;
    edgeType: string;
    nodeId: number;
    nodeIndex: number;
    nodeName: string;
    distance: number;
    children: RetainingEdge[];
}
export interface RetainingPaths {
    paths: RetainingEdge[];
    limitsReached: {
        depth?: boolean;
        nodes?: boolean;
        siblings?: boolean;
    };
}
export interface DominatorNode {
    nodeId: number;
    nodeIndex: number;
    nodeName: string;
    retainedSize: number;
    selfSize: number;
}
export type DominatorChain = DominatorNode[];
export interface DuplicateStringGroup {
    value: string;
    count: number;
    totalSelfSize: number;
    totalRetainedSize: number;
    nodes: Array<{
        id: number;
        selfSize: number;
        retainedSize: number;
        distance: number;
    }>;
    truncated?: boolean;
    length?: number;
    hash?: number;
}
export interface NativeContextSize {
    nodeId: number;
    nodeIndex: number;
    nodeName: string;
    attributedSize: number;
    retainedSize: number;
    selfSize: number;
}
export interface NativeContextSizes {
    nativeContexts: NativeContextSize[];
    sharedSize: number;
    noAttributionSize: number;
}
export interface RetainedByContextSummary {
    contextCount: number;
    retainedByContextSize: number;
    retainedByContextCount: number;
    notRetainedByContextSize: number;
    notRetainedByContextCount: number;
    totalSize: number;
}
export declare const enum DOMLinkState {
    UNKNOWN = 0,
    ATTACHED = 1,
    DETACHED = 2
}
export interface ObjectInfo {
    id: number;
    name: string;
    type: string;
    nodeIndex: number;
    detachedness: DOMLinkState;
    selfSize: number;
    retainedSize: number;
    distance: number;
    edgeCount: number;
    retainerCount: number;
}
export interface ContextAnalysisResult {
    /** Scopes with dead fields, sorted by their highest-ranked context. */
    scopes: ScopeAnalysis[];
    /** Scripts with live contexts that could not be analyzed because they lack embedded scope metadata. */
    scriptsWithoutScopes: ScriptWithoutScopes[];
}
export interface ScopeAnalysis {
    scopeInfoNodeIndex: number;
    scopeInfoNodeId: number;
    scriptNodeIndex: number;
    scriptNodeId: number;
    scriptName: string;
    /** Source name of the scope, when available. */
    scopeName?: string;
    scopeStart: number;
    scopeEnd: number;
    /** Number of context-typed fields in each context belonging to this scope. */
    contextFieldCount: number;
    /** Contexts with dead fields, sorted descending by deadFieldsRetainedSizeSum. */
    contexts: ContextAnalysis[];
}
export interface ContextAnalysis {
    contextNodeIndex: number;
    contextNodeId: number;
    retainedSize: number;
    /**
     * The sum of the retained sizes of values in fields classified as dead.
     * This is a ranking heuristic, not the number of bytes that would be
     * reclaimed by clearing the fields.
     */
    deadFieldsRetainedSizeSum: number;
    /** Fields classified as dead in this context, sorted descending by retainedSize. */
    deadFields: ContextField[];
}
export interface ContextField {
    name: string;
    valueNodeIndex: number;
    valueNodeId: number;
    valueName: string;
    valueType: string;
    selfSize: number;
    retainedSize: number;
}
export interface ScriptWithoutScopes {
    scriptNodeIndex: number;
    scriptNodeId: number;
    scriptName: string;
    /** Number of live context instances belonging to this script. */
    contextCount: number;
}
export interface HeapQueryOptions {
    className?: string;
    propertyName?: string;
    nodeType?: string;
    minRetainedSize?: number;
    maxRetainedSize?: number;
    minSelfSize?: number;
    maxSelfSize?: number;
    isDetached?: boolean;
    sortBy?: 'retainedSize' | 'selfSize' | 'id';
}
export interface HeapEdgesQueryOptions {
    sortBy?: 'retainedSize' | 'selfSize' | 'name';
    minRetainedSize?: number;
    excludePrimitives?: boolean;
}
