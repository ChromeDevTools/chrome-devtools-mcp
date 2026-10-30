import * as Graph from '../graph/graph.js';
import type * as Lantern from '../types/types.js';
import { ConnectionPool } from './ConnectionPool.js';
import { DNSCache } from './DNSCache.js';
import { type CompleteNodeTiming, type ConnectionTiming, SimulatorTimingMap } from './SimulationTimingMap.js';
import { TCPConnection } from './TCPConnection.js';
export interface Result<T = Lantern.AnyNetworkObject> {
    timeInMs: number;
    nodeTimings: Map<Graph.Node<T>, Lantern.Simulation.NodeTiming>;
}
declare class Simulator<T = Lantern.AnyNetworkObject> {
    static createSimulator(settings: Lantern.Simulation.Settings): Simulator;
    options: Required<Lantern.Simulation.Options>;
    _rtt: number;
    throughput: number;
    maximumConcurrentRequests: number;
    cpuSlowdownMultiplier: number;
    layoutTaskMultiplier: number;
    cachedNodeListByStartPosition: Graph.Node[];
    nodeTimings: SimulatorTimingMap;
    numberInProgressByType: Map<string, number>;
    nodes: Record<number, Set<Graph.Node>>;
    dns: DNSCache;
    connectionPool: ConnectionPool;
    constructor(options?: Lantern.Simulation.Options);
    get rtt(): number;
    initializeConnectionPool(graph: Graph.Node): void;
    /**
     * Initializes the various state data structures such _nodeTimings and the _node Sets by state.
     */
    initializeAuxiliaryData(): void;
    numberInProgress(type: string): number;
    markNodeAsReadyToStart(node: Graph.Node, queuedTime: number): void;
    markNodeAsInProgress(node: Graph.Node, startTime: number): void;
    markNodeAsComplete(node: Graph.Node, endTime: number, connectionTiming?: ConnectionTiming): void;
    acquireConnection(request: Lantern.NetworkRequest): TCPConnection | null;
    getNodesSortedByStartPosition(): Graph.Node[];
    startNodeIfPossible(node: Graph.Node, totalElapsedTime: number): void;
    /**
     * Updates each connection in use with the available throughput based on the number of network requests
     * currently in flight.
     */
    updateNetworkCapacity(): void;
    /**
     * Estimates the number of milliseconds remaining given current conditions before the node is complete.
     */
    estimateTimeRemaining(node: Graph.Node): number;
    estimateCPUTimeRemaining(cpuNode: Graph.CPUNode): number;
    estimateNetworkTimeRemaining(networkNode: Graph.NetworkNode): number;
    /**
     * Computes and returns the minimum estimated completion time of the nodes currently in progress.
     */
    findNextNodeCompletionTime(): number;
    /**
     * Given a time period, computes the progress toward completion that the node made during that time.
     */
    updateProgressMadeInTimePeriod(node: Graph.Node, timePeriodLength: number, totalElapsedTime: number): void;
    computeFinalNodeTimings(): {
        nodeTimings: Map<Graph.Node, Lantern.Simulation.NodeTiming>;
        completeNodeTimings: Map<Graph.Node, CompleteNodeTiming>;
    };
    getOptions(): Required<Lantern.Simulation.Options>;
    /**
     * Estimates the time taken to process all of the graph's nodes, returns the overall time along with
     * each node annotated by start/end times.
     *
     * Simulator/connection pool are allowed to deviate from what was
     * observed in the trace/devtoolsLog and start requests as soon as they are queued (i.e. do not
     * wait around for a warm connection to be available if the original request was fetched on a warm
     * connection).
     */
    simulate(graph: Graph.Node, options?: {
        label?: string;
    }): Result<T>;
    computeWastedMsFromWastedBytes(wastedBytes: number): number;
    static get allNodeTimings(): Map<string, Map<Graph.Node, CompleteNodeTiming>>;
    /**
     * We attempt to start nodes by their observed start time using the request priority as a tie breaker.
     * When simulating, just because a low priority image started 5ms before a high priority image doesn't mean
     * it would have happened like that when the network was slower.
     */
    static computeNodeStartPosition(node: Graph.Node): number;
}
export { Simulator };
