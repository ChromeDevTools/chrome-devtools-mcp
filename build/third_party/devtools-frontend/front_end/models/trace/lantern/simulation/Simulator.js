// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Core from '../core/core.js';
import * as Graph from '../graph/graph.js';
import { ConnectionPool } from './ConnectionPool.js';
import { Constants } from './Constants.js';
import { DNSCache } from './DNSCache.js';
import { SimulatorTimingMap } from './SimulationTimingMap.js';
import { TCPConnection } from './TCPConnection.js';
const defaultThrottling = Constants.throttling.mobileSlow4G;
// see https://cs.chromium.org/search/?q=kDefaultMaxNumDelayableRequestsPerClient&sq=package:chromium&type=cs
const DEFAULT_MAXIMUM_CONCURRENT_REQUESTS = 10;
// layout tasks tend to be less CPU-bound and do not experience the same increase in duration
const DEFAULT_LAYOUT_TASK_MULTIPLIER = 0.5;
// if a task takes more than 10 seconds it's usually a sign it isn't actually CPU bound and we're overestimating
const DEFAULT_MAXIMUM_CPU_TASK_DURATION = 10000;
const NodeState = {
    NotReadyToStart: 0,
    ReadyToStart: 1,
    InProgress: 2,
    Complete: 3,
};
const PriorityStartTimePenalty = {
    VeryHigh: 0,
    High: 0.25,
    Medium: 0.5,
    Low: 1,
    VeryLow: 2,
};
const ALL_SIMULATION_NODE_TIMINGS = new Map();
class Simulator {
    static createSimulator(settings) {
        const { throttlingMethod, throttling, precomputedLanternData, networkAnalysis } = settings;
        const options = {
            additionalRttByOrigin: networkAnalysis.additionalRttByOrigin,
            serverResponseTimeByOrigin: networkAnalysis.serverResponseTimeByOrigin,
            observedThroughput: networkAnalysis.throughput,
        };
        // If we have precomputed lantern data, overwrite our observed estimates and use precomputed instead
        // for increased stability.
        if (precomputedLanternData) {
            options.additionalRttByOrigin = new Map(Object.entries(precomputedLanternData.additionalRttByOrigin));
            options.serverResponseTimeByOrigin = new Map(Object.entries(precomputedLanternData.serverResponseTimeByOrigin));
        }
        switch (throttlingMethod) {
            case 'provided':
                options.rtt = networkAnalysis.rtt;
                options.throughput = networkAnalysis.throughput;
                options.cpuSlowdownMultiplier = 1;
                options.layoutTaskMultiplier = 1;
                break;
            case 'devtools':
                if (throttling) {
                    options.rtt = throttling.requestLatencyMs / Constants.throttling.DEVTOOLS_RTT_ADJUSTMENT_FACTOR;
                    options.throughput =
                        throttling.downloadThroughputKbps * 1024 / Constants.throttling.DEVTOOLS_THROUGHPUT_ADJUSTMENT_FACTOR;
                }
                options.cpuSlowdownMultiplier = 1;
                options.layoutTaskMultiplier = 1;
                break;
            case 'simulate':
                if (throttling) {
                    options.rtt = throttling.rttMs;
                    options.throughput = throttling.throughputKbps * 1024;
                    options.cpuSlowdownMultiplier = throttling.cpuSlowdownMultiplier;
                }
                break;
            default:
                // intentionally fallback to simulator defaults
                break;
        }
        return new Simulator(options);
    }
    options;
    _rtt;
    throughput;
    maximumConcurrentRequests;
    cpuSlowdownMultiplier;
    layoutTaskMultiplier;
    cachedNodeListByStartPosition;
    nodeTimings;
    numberInProgressByType;
    nodes;
    dns;
    connectionPool;
    constructor(options) {
        this.options = Object.assign({
            rtt: defaultThrottling.rttMs,
            throughput: defaultThrottling.throughputKbps * 1024,
            maximumConcurrentRequests: DEFAULT_MAXIMUM_CONCURRENT_REQUESTS,
            cpuSlowdownMultiplier: defaultThrottling.cpuSlowdownMultiplier,
            layoutTaskMultiplier: DEFAULT_LAYOUT_TASK_MULTIPLIER,
            additionalRttByOrigin: new Map(),
            serverResponseTimeByOrigin: new Map(),
        }, options);
        this._rtt = this.options.rtt;
        this.throughput = this.options.throughput;
        this.maximumConcurrentRequests = Math.max(Math.min(TCPConnection.maximumSaturatedConnections(this._rtt, this.throughput), this.options.maximumConcurrentRequests), 1);
        this.cpuSlowdownMultiplier = this.options.cpuSlowdownMultiplier;
        this.layoutTaskMultiplier = this.cpuSlowdownMultiplier * this.options.layoutTaskMultiplier;
        this.cachedNodeListByStartPosition = [];
        // Properties reset on every `.simulate` call but duplicated here for type checking
        this.nodeTimings = new SimulatorTimingMap();
        this.numberInProgressByType = new Map();
        this.nodes = {};
        this.dns = new DNSCache({ rtt: this._rtt });
        // @ts-expect-error
        this.connectionPool = null;
        if (!Number.isFinite(this._rtt)) {
            throw new Core.LanternError(`Invalid rtt ${this._rtt}`);
        }
        if (!Number.isFinite(this.throughput)) {
            throw new Core.LanternError(`Invalid throughput ${this.throughput}`);
        }
    }
    get rtt() {
        return this._rtt;
    }
    initializeConnectionPool(graph) {
        const records = [];
        graph.getRootNode().traverse(node => {
            if (node.type === Graph.BaseNode.types.NETWORK) {
                records.push(node.request);
            }
        });
        this.connectionPool = new ConnectionPool(records, this.options);
    }
    /**
     * Initializes the various state data structures such _nodeTimings and the _node Sets by state.
     */
    initializeAuxiliaryData() {
        this.nodeTimings = new SimulatorTimingMap();
        this.numberInProgressByType = new Map();
        this.nodes = {};
        this.cachedNodeListByStartPosition = [];
        // NOTE: We don't actually need *all* of these sets, but the clarity that each node progresses
        // through the system is quite nice.
        for (const state of Object.values(NodeState)) {
            this.nodes[state] = new Set();
        }
    }
    numberInProgress(type) {
        return this.numberInProgressByType.get(type) || 0;
    }
    markNodeAsReadyToStart(node, queuedTime) {
        const nodeStartPosition = Simulator.computeNodeStartPosition(node);
        const firstNodeIndexWithGreaterStartPosition = this.cachedNodeListByStartPosition.findIndex(candidate => Simulator.computeNodeStartPosition(candidate) > nodeStartPosition);
        const insertionIndex = firstNodeIndexWithGreaterStartPosition === -1 ? this.cachedNodeListByStartPosition.length :
            firstNodeIndexWithGreaterStartPosition;
        this.cachedNodeListByStartPosition.splice(insertionIndex, 0, node);
        this.nodes[NodeState.ReadyToStart].add(node);
        this.nodes[NodeState.NotReadyToStart].delete(node);
        this.nodeTimings.setReadyToStart(node, { queuedTime });
    }
    markNodeAsInProgress(node, startTime) {
        const indexOfNodeToStart = this.cachedNodeListByStartPosition.indexOf(node);
        this.cachedNodeListByStartPosition.splice(indexOfNodeToStart, 1);
        this.nodes[NodeState.InProgress].add(node);
        this.nodes[NodeState.ReadyToStart].delete(node);
        if (!(node.type === Graph.BaseNode.types.NETWORK && node.isConnectionless)) {
            this.numberInProgressByType.set(node.type, this.numberInProgress(node.type) + 1);
        }
        this.nodeTimings.setInProgress(node, { startTime });
    }
    markNodeAsComplete(node, endTime, connectionTiming) {
        this.nodes[NodeState.Complete].add(node);
        this.nodes[NodeState.InProgress].delete(node);
        if (!(node.type === Graph.BaseNode.types.NETWORK && node.isConnectionless)) {
            this.numberInProgressByType.set(node.type, this.numberInProgress(node.type) - 1);
        }
        this.nodeTimings.setCompleted(node, { endTime, connectionTiming });
        // Try to add all its dependents to the queue
        for (const dependent of node.getDependents()) {
            // Skip dependent node if one of its dependencies hasn't finished yet
            const dependencies = dependent.getDependencies();
            if (dependencies.some(dep => !this.nodes[NodeState.Complete].has(dep))) {
                continue;
            }
            // Otherwise add it to the queue
            this.markNodeAsReadyToStart(dependent, endTime);
        }
    }
    acquireConnection(request) {
        return this.connectionPool.acquire(request);
    }
    getNodesSortedByStartPosition() {
        // Make a copy so we don't skip nodes due to concurrent modification
        return Array.from(this.cachedNodeListByStartPosition);
    }
    startNodeIfPossible(node, totalElapsedTime) {
        if (node.type === Graph.BaseNode.types.CPU) {
            // Start a CPU task if there's no other CPU task in process
            if (this.numberInProgress(node.type) === 0) {
                this.markNodeAsInProgress(node, totalElapsedTime);
            }
            return;
        }
        if (node.type !== Graph.BaseNode.types.NETWORK) {
            throw new Core.LanternError('Unsupported');
        }
        // If a network request is connectionless, we can always start it, so skip the connection checks
        if (!node.isConnectionless) {
            // Start a network request if we're not at max requests and a connection is available
            const numberOfActiveRequests = this.numberInProgress(node.type);
            if (numberOfActiveRequests >= this.maximumConcurrentRequests) {
                return;
            }
            const connection = this.acquireConnection(node.request);
            if (!connection) {
                return;
            }
        }
        this.markNodeAsInProgress(node, totalElapsedTime);
    }
    /**
     * Updates each connection in use with the available throughput based on the number of network requests
     * currently in flight.
     */
    updateNetworkCapacity() {
        const inFlight = this.numberInProgress(Graph.BaseNode.types.NETWORK);
        if (inFlight === 0) {
            return;
        }
        for (const connection of this.connectionPool.connectionsInUse()) {
            connection.setThroughput(this.throughput / inFlight);
        }
    }
    /**
     * Estimates the number of milliseconds remaining given current conditions before the node is complete.
     */
    estimateTimeRemaining(node) {
        if (node.type === Graph.BaseNode.types.CPU) {
            return this.estimateCPUTimeRemaining(node);
        }
        if (node.type === Graph.BaseNode.types.NETWORK) {
            return this.estimateNetworkTimeRemaining(node);
        }
        throw new Core.LanternError('Unsupported');
    }
    estimateCPUTimeRemaining(cpuNode) {
        const timingData = this.nodeTimings.getCpuStarted(cpuNode);
        const multiplier = cpuNode.didPerformLayout() ? this.layoutTaskMultiplier : this.cpuSlowdownMultiplier;
        const totalDuration = Math.min(Math.round(cpuNode.duration / 1000 * multiplier), DEFAULT_MAXIMUM_CPU_TASK_DURATION);
        const estimatedTimeElapsed = totalDuration - timingData.timeElapsed;
        this.nodeTimings.setCpuEstimated(cpuNode, { estimatedTimeElapsed });
        return estimatedTimeElapsed;
    }
    estimateNetworkTimeRemaining(networkNode) {
        const request = networkNode.request;
        const timingData = this.nodeTimings.getNetworkStarted(networkNode);
        let timeElapsed = 0;
        if (networkNode.fromDiskCache) {
            // Rough access time for seeking to location on disk and reading sequentially.
            // 8ms per seek + 20ms/MB
            // @see http://norvig.com/21-days.html#answers
            const sizeInMb = (request.resourceSize || 0) / 1024 / 1024;
            timeElapsed = 8 + 20 * sizeInMb - timingData.timeElapsed;
        }
        else if (networkNode.isNonNetworkProtocol) {
            // Estimates for the overhead of a data URL in Chromium and the decoding time for base64-encoded data.
            // 2ms per request + 10ms/MB
            // @see traces on https://dopiaza.org/tools/datauri/examples/index.php
            const sizeInMb = (request.resourceSize || 0) / 1024 / 1024;
            timeElapsed = 2 + 10 * sizeInMb - timingData.timeElapsed;
        }
        else {
            const connection = this.connectionPool.acquireActiveConnectionFromRequest(request);
            const dnsResolutionTime = this.dns.getTimeUntilResolution(request, {
                requestedAt: timingData.startTime,
                shouldUpdateCache: true,
            });
            const timeAlreadyElapsed = timingData.timeElapsed;
            const calculation = connection.simulateDownloadUntil(request.transferSize - timingData.bytesDownloaded, { timeAlreadyElapsed, dnsResolutionTime, maximumTimeToElapse: Infinity });
            timeElapsed = calculation.timeElapsed;
        }
        const estimatedTimeElapsed = timeElapsed + timingData.timeElapsedOvershoot;
        this.nodeTimings.setNetworkEstimated(networkNode, { estimatedTimeElapsed });
        return estimatedTimeElapsed;
    }
    /**
     * Computes and returns the minimum estimated completion time of the nodes currently in progress.
     */
    findNextNodeCompletionTime() {
        let minimumTime = Infinity;
        for (const node of this.nodes[NodeState.InProgress]) {
            minimumTime = Math.min(minimumTime, this.estimateTimeRemaining(node));
        }
        return minimumTime;
    }
    /**
     * Given a time period, computes the progress toward completion that the node made during that time.
     */
    updateProgressMadeInTimePeriod(node, timePeriodLength, totalElapsedTime) {
        const timingData = this.nodeTimings.getInProgress(node);
        const isFinished = timingData.estimatedTimeElapsed === timePeriodLength;
        if (node.type === Graph.BaseNode.types.CPU || node.isConnectionless) {
            if (isFinished) {
                this.markNodeAsComplete(node, totalElapsedTime);
            }
            else {
                timingData.timeElapsed += timePeriodLength;
            }
            return;
        }
        if (node.type !== Graph.BaseNode.types.NETWORK) {
            throw new Core.LanternError('Unsupported');
        }
        if (!('bytesDownloaded' in timingData)) {
            throw new Core.LanternError('Invalid timing data');
        }
        const request = node.request;
        const connection = this.connectionPool.acquireActiveConnectionFromRequest(request);
        const dnsResolutionTime = this.dns.getTimeUntilResolution(request, {
            requestedAt: timingData.startTime,
            shouldUpdateCache: true,
        });
        const bytesToDownload = request.transferSize - timingData.bytesDownloaded;
        const h2OverflowBytesUsed = connection.isMultiplexed() ? Math.min(bytesToDownload, connection.h2OverflowBytesDownloaded) : 0;
        const calculation = connection.simulateDownloadUntil(bytesToDownload, {
            dnsResolutionTime,
            timeAlreadyElapsed: timingData.timeElapsed,
            maximumTimeToElapse: timePeriodLength - timingData.timeElapsedOvershoot,
        });
        connection.setCongestionWindow(calculation.congestionWindow);
        connection.setH2OverflowBytesDownloaded(calculation.extraBytesDownloaded);
        if (isFinished) {
            connection.setWarmed(true);
            this.connectionPool.release(request);
            this.markNodeAsComplete(node, totalElapsedTime, calculation.connectionTiming);
        }
        else {
            timingData.timeElapsed += calculation.timeElapsed;
            timingData.timeElapsedOvershoot += calculation.timeElapsed - timePeriodLength;
            timingData.bytesDownloaded += calculation.bytesDownloaded + h2OverflowBytesUsed;
        }
    }
    computeFinalNodeTimings() {
        const completeNodeTimingEntries = this.nodeTimings.getNodes().map(node => {
            return [node, this.nodeTimings.getCompleted(node)];
        });
        // Most consumers will want the entries sorted by startTime, so insert them in that order
        completeNodeTimingEntries.sort((a, b) => a[1].startTime - b[1].startTime);
        // Trimmed version of type `Lantern.Simulation.NodeTiming`.
        const nodeTimingEntries = completeNodeTimingEntries.map(([node, timing]) => {
            return [
                node,
                {
                    startTime: timing.startTime,
                    endTime: timing.endTime,
                    duration: timing.endTime - timing.startTime,
                },
            ];
        });
        return {
            nodeTimings: new Map(nodeTimingEntries),
            completeNodeTimings: new Map(completeNodeTimingEntries),
        };
    }
    getOptions() {
        return this.options;
    }
    /**
     * Estimates the time taken to process all of the graph's nodes, returns the overall time along with
     * each node annotated by start/end times.
     *
     * Simulator/connection pool are allowed to deviate from what was
     * observed in the trace/devtoolsLog and start requests as soon as they are queued (i.e. do not
     * wait around for a warm connection to be available if the original request was fetched on a warm
     * connection).
     */
    simulate(graph, options) {
        if (Graph.BaseNode.findCycle(graph)) {
            throw new Core.LanternError('Cannot simulate graph with cycle');
        }
        options = Object.assign({
            label: undefined,
        }, options);
        // initialize the necessary data containers
        this.dns = new DNSCache({ rtt: this._rtt });
        this.initializeConnectionPool(graph);
        this.initializeAuxiliaryData();
        const nodesNotReadyToStart = this.nodes[NodeState.NotReadyToStart];
        const nodesReadyToStart = this.nodes[NodeState.ReadyToStart];
        const nodesInProgress = this.nodes[NodeState.InProgress];
        const rootNode = graph.getRootNode();
        rootNode.traverse(node => nodesNotReadyToStart.add(node));
        let totalElapsedTime = 0;
        let iteration = 0;
        // root node is always ready to start
        this.markNodeAsReadyToStart(rootNode, totalElapsedTime);
        // loop as long as we have nodes in the queue or currently in progress
        while (nodesReadyToStart.size || nodesInProgress.size) {
            // move all possible queued nodes to in progress
            for (const node of this.getNodesSortedByStartPosition()) {
                this.startNodeIfPossible(node, totalElapsedTime);
            }
            if (!nodesInProgress.size) {
                // Interplay between fromDiskCache and connectionReused can be incorrect,
                // have to give up.
                throw new Core.LanternError('Failed to start a node');
            }
            // set the available throughput for all connections based on # in-flight
            this.updateNetworkCapacity();
            // find the time that the next node will finish
            const minimumTime = this.findNextNodeCompletionTime();
            totalElapsedTime += minimumTime;
            // While this is no longer strictly necessary, it's always better than hanging
            if (!Number.isFinite(minimumTime) || iteration > 100000) {
                throw new Core.LanternError('Simulation failed, depth exceeded');
            }
            iteration++;
            // update how far each node will progress until that point
            for (const node of nodesInProgress) {
                this.updateProgressMadeInTimePeriod(node, minimumTime, totalElapsedTime);
            }
        }
        // `nodeTimings` are used for simulator consumers, `completeNodeTimings` kept for debugging.
        const { nodeTimings, completeNodeTimings } = this.computeFinalNodeTimings();
        ALL_SIMULATION_NODE_TIMINGS.set(options.label || 'unlabeled', completeNodeTimings);
        return {
            timeInMs: totalElapsedTime,
            nodeTimings,
        };
    }
    computeWastedMsFromWastedBytes(wastedBytes) {
        const { throughput, observedThroughput } = this.options;
        // https://github.com/GoogleChrome/lighthouse/pull/13323#issuecomment-962031709
        // 0 throughput means the no (additional) throttling is expected.
        // This is common for desktop + devtools throttling where throttling is additive and we don't want any additional.
        const bitsPerSecond = throughput === 0 ? observedThroughput : throughput;
        if (bitsPerSecond === 0) {
            return 0;
        }
        const wastedBits = wastedBytes * 8;
        const wastedMs = wastedBits / bitsPerSecond * 1000;
        // This is an estimate of wasted time, so we won't be more precise than 10ms.
        return Math.round(wastedMs / 10) * 10;
    }
    // Used by Lighthouse asset-saver
    static get allNodeTimings() {
        return ALL_SIMULATION_NODE_TIMINGS;
    }
    /**
     * We attempt to start nodes by their observed start time using the request priority as a tie breaker.
     * When simulating, just because a low priority image started 5ms before a high priority image doesn't mean
     * it would have happened like that when the network was slower.
     */
    static computeNodeStartPosition(node) {
        if (node.type === 'cpu') {
            return node.startTime;
        }
        return node.startTime + (PriorityStartTimePenalty[node.request.priority] * 1000 * 1000 || 0);
    }
}
export { Simulator };
//# sourceMappingURL=Simulator.js.map