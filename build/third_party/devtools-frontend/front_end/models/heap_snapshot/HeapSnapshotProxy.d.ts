import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import type { ChildrenProvider } from './ChildrenProvider.js';
import type * as HeapSnapshotModel from './HeapSnapshotModel.js';
export declare class HeapSnapshotWorkerProxy extends Common.ObjectWrapper.ObjectWrapper<HeapSnapshotWorkerProxy.EventTypes> {
    #private;
    readonly eventHandler: (arg0: string, arg1: string) => void;
    nextObjectId: number;
    nextCallId: number;
    callbacks: Map<number, (error?: string, result?: unknown) => void>;
    readonly previousCallbacks: Set<number>;
    readonly worker: Platform.HostRuntime.Worker;
    interval?: ReturnType<typeof setInterval>;
    readonly workerUrl?: string;
    constructor(eventHandler: (arg0: string, arg1: string) => void, console: Common.Console.Console, workerUrl?: string);
    get console(): Common.Console.Console;
    createLoader(profileUid: number, snapshotReceivedCallback: (arg0: HeapSnapshotProxy) => void): HeapSnapshotLoaderProxy;
    dispose(): void;
    disposeObject(objectId: number): void;
    evaluateForTest(script: string, callback: (...arg0: any[]) => void): void;
    callFactoryMethod<T extends Object>(callback: null, objectId: string, methodName: string, proxyConstructor: new (...arg1: any[]) => T, transfer: Platform.HostRuntime.WorkerTransferable[], ...methodArguments: any[]): T;
    callFactoryMethod<T extends Object>(callback: ((error?: string, result?: T) => void), objectId: string, methodName: string, proxyConstructor: new (...arg1: any[]) => T, transfer: Platform.HostRuntime.WorkerTransferable[], ...methodArguments: any[]): null;
    callMethod(callback: ((error?: string, result?: unknown) => void) | null, objectId: string, methodName: string, ...methodArguments: any[]): void;
    startCheckingForLongRunningCalls(): void;
    checkLongRunningCalls(): void;
    setupForSecondaryInit(port: Platform.HostRuntime.WorkerMessagePort): Promise<void>;
    messageReceived(event: Platform.HostRuntime.WorkerMessageEvent): void;
    postMessage(message: unknown, transfer?: Platform.HostRuntime.WorkerTransferable[]): void;
}
export declare namespace HeapSnapshotWorkerProxy {
    const enum Events {
        WAIT = "Wait"
    }
    interface EventTypes {
        [Events.WAIT]: boolean;
    }
}
export declare class HeapSnapshotProxyObject {
    readonly worker: HeapSnapshotWorkerProxy;
    readonly objectId: number;
    constructor(worker: HeapSnapshotWorkerProxy, objectId: number);
    dispose(): void;
    callFactoryMethod<T extends Object>(methodName: string, proxyConstructor: new (...arg1: any[]) => T, ...args: any[]): T;
    callFactoryMethodPromise<T extends Object>(methodName: string, proxyConstructor: new (...arg1: any[]) => T, transfer: Platform.HostRuntime.WorkerTransferable[], ...args: any[]): Promise<T>;
    callMethodPromise<T>(methodName: string, ...args: any[]): Promise<T>;
}
export declare class HeapSnapshotLoaderProxy extends HeapSnapshotProxyObject implements Common.StringOutputStream.OutputStream {
    readonly profileUid: number;
    readonly snapshotReceivedCallback: (arg0: HeapSnapshotProxy) => void;
    constructor(worker: HeapSnapshotWorkerProxy, objectId: number, profileUid: number, snapshotReceivedCallback: (arg0: HeapSnapshotProxy) => void);
    write(chunk: string): Promise<void>;
    close(): Promise<void>;
}
export declare class HeapSnapshotProxy extends HeapSnapshotProxyObject {
    staticData: HeapSnapshotModel.StaticData | null;
    profileUid?: number;
    constructor(worker: HeapSnapshotWorkerProxy, objectId: number);
    search(searchConfig: HeapSnapshotModel.SearchConfig, filter: HeapSnapshotModel.NodeFilter): Promise<number[]>;
    interfaceDefinitions(): Promise<string>;
    getNativeContextSizes(): Promise<HeapSnapshotModel.NativeContextSizes>;
    getRetainedByContextSummary(): Promise<HeapSnapshotModel.RetainedByContextSummary>;
    aggregatesWithFilter(filter: HeapSnapshotModel.NodeFilter): Promise<Record<string, HeapSnapshotModel.AggregatedInfo>>;
    getDuplicateStrings(): Promise<HeapSnapshotModel.DuplicateStringGroup[]>;
    aggregatesForDiff(interfaceDefinitions: string): Promise<Record<string, HeapSnapshotModel.AggregateForDiff>>;
    calculateSnapshotDiff(baseSnapshotId: number, baseSnapshotAggregates: Record<string, HeapSnapshotModel.AggregateForDiff>): Promise<Record<string, HeapSnapshotModel.Diff>>;
    nodeClassKey(snapshotObjectId: number): Promise<string | null>;
    nodeIndexForId(nodeId: number): Promise<number | undefined>;
    getObjectInfo(nodeIndex: number): Promise<HeapSnapshotModel.ObjectInfo>;
    analyzeContexts(): Promise<HeapSnapshotModel.ContextAnalysisResult>;
    createEdgesProvider(nodeIndex: number, options?: HeapSnapshotModel.HeapEdgesQueryOptions): HeapSnapshotProviderProxy;
    createRetainingEdgesProvider(nodeIndex: number): HeapSnapshotProviderProxy;
    createAddedNodesProvider(baseSnapshotId: number, classKey: string): HeapSnapshotProviderProxy;
    createDeletedNodesProvider(nodeIndexes: number[]): HeapSnapshotProviderProxy;
    createNodesProvider(filter: (...args: any[]) => boolean): HeapSnapshotProviderProxy;
    createNodesProviderForClass(classKey: string, nodeFilter: HeapSnapshotModel.NodeFilter): HeapSnapshotProviderProxy;
    queryObjects(queryOptions: HeapSnapshotModel.HeapQueryOptions): HeapSnapshotProviderProxy;
    allocationTracesTops(): Promise<HeapSnapshotModel.SerializedAllocationNode[]>;
    allocationNodeCallers(nodeId: number): Promise<HeapSnapshotModel.AllocationNodeCallers>;
    allocationStack(nodeIndex: number): Promise<HeapSnapshotModel.AllocationStackFrame[] | null>;
    dispose(): void;
    get nodeCount(): number;
    get rootNodeIndex(): number;
    updateStaticData(): Promise<void>;
    getStatistics(): Promise<HeapSnapshotModel.Statistics>;
    getLocation(nodeIndex: number): Promise<HeapSnapshotModel.Location | null>;
    getSamples(): Promise<HeapSnapshotModel.Samples | null>;
    ignoreNodeInRetainersView(nodeIndex: number): Promise<void>;
    getRetainingPaths(nodeIndex: number, maxDepth?: number, maxNodes?: number, maxSiblings?: number): Promise<HeapSnapshotModel.RetainingPaths>;
    getDominatorsOf(nodeIndex: number): Promise<HeapSnapshotModel.DominatorChain>;
    unignoreNodeInRetainersView(nodeIndex: number): Promise<void>;
    unignoreAllNodesInRetainersView(): Promise<void>;
    areNodesIgnoredInRetainersView(): Promise<boolean>;
    get totalSize(): number;
    get uid(): number | undefined;
    setProfileUid(profileUid: number): void;
    maxJSObjectId(): number;
}
export declare class HeapSnapshotProviderProxy extends HeapSnapshotProxyObject implements ChildrenProvider {
    nodePosition(snapshotObjectId: number): Promise<number>;
    isEmpty(): Promise<boolean>;
    serializeItemsRange(startPosition: number, endPosition: number): Promise<HeapSnapshotModel.ItemsRange>;
    sortAndRewind(comparator: HeapSnapshotModel.ComparatorConfig): Promise<void>;
}
