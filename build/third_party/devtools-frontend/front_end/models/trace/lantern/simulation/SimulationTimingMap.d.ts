import * as Graph from '../graph/graph.js';
interface NodeTimingComplete {
    startTime: number;
    endTime: number;
    queuedTime: number;
    estimatedTimeElapsed: number;
    timeElapsed: number;
    timeElapsedOvershoot: number;
    bytesDownloaded: number;
}
type NodeTimingQueued = Pick<NodeTimingComplete, 'queuedTime'>;
type CpuNodeTimingStarted = NodeTimingQueued & Pick<NodeTimingComplete, 'startTime' | 'timeElapsed'>;
type NetworkNodeTimingStarted = CpuNodeTimingStarted & Pick<NodeTimingComplete, 'timeElapsedOvershoot' | 'bytesDownloaded'>;
type CpuNodeTimingInProgress = CpuNodeTimingStarted & Pick<NodeTimingComplete, 'estimatedTimeElapsed'>;
type NetworkNodeTimingInProgress = NetworkNodeTimingStarted & Pick<NodeTimingComplete, 'estimatedTimeElapsed'>;
export type CpuNodeTimingComplete = CpuNodeTimingInProgress & Pick<NodeTimingComplete, 'endTime'>;
export type NetworkNodeTimingComplete = NetworkNodeTimingInProgress & Pick<NodeTimingComplete, 'endTime'> & {
    connectionTiming: ConnectionTiming;
};
export type CompleteNodeTiming = CpuNodeTimingComplete | NetworkNodeTimingComplete;
type NodeTimingData = NodeTimingQueued | CpuNodeTimingStarted | NetworkNodeTimingStarted | CpuNodeTimingInProgress | NetworkNodeTimingInProgress | CpuNodeTimingComplete | NetworkNodeTimingComplete;
export interface ConnectionTiming {
    dnsResolutionTime?: number;
    connectionTime?: number;
    sslTime?: number;
    timeToFirstByte: number;
}
declare class SimulatorTimingMap {
    nodeTimings: Map<Graph.Node, NodeTimingData>;
    constructor();
    getNodes(): Graph.Node[];
    setReadyToStart(node: Graph.Node, values: {
        queuedTime: number;
    }): void;
    setInProgress(node: Graph.Node, values: {
        startTime: number;
    }): void;
    setCompleted(node: Graph.Node, values: {
        endTime: number;
        connectionTiming?: ConnectionTiming;
    }): void;
    setCpu(node: Graph.CPUNode, values: {
        timeElapsed: number;
    }): void;
    setCpuEstimated(node: Graph.CPUNode, values: {
        estimatedTimeElapsed: number;
    }): void;
    setNetwork(node: Graph.NetworkNode, values: {
        timeElapsed: number;
        timeElapsedOvershoot: number;
        bytesDownloaded: number;
    }): void;
    setNetworkEstimated(node: Graph.NetworkNode, values: {
        estimatedTimeElapsed: number;
    }): void;
    getQueued(node: Graph.Node): NodeTimingData;
    getCpuStarted(node: Graph.CPUNode): CpuNodeTimingStarted;
    getNetworkStarted(node: Graph.NetworkNode): NetworkNodeTimingStarted;
    getInProgress(node: Graph.Node): CpuNodeTimingInProgress | NetworkNodeTimingInProgress;
    getCompleted(node: Graph.Node): CpuNodeTimingComplete | NetworkNodeTimingComplete;
}
export { SimulatorTimingMap };
