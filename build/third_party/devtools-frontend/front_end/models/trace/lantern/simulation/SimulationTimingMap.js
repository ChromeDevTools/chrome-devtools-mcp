// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @file
 *
 * This class encapsulates the type-related validation logic for moving timing information for nodes
 * through the different simulation phases. Methods here ensure that the invariants of simulation hold
 * as nodes are queued, partially simulated, and completed.
 */
import * as Core from '../core/core.js';
import * as Graph from '../graph/graph.js';
class SimulatorTimingMap {
    nodeTimings;
    constructor() {
        this.nodeTimings = new Map();
    }
    getNodes() {
        return Array.from(this.nodeTimings.keys());
    }
    setReadyToStart(node, values) {
        this.nodeTimings.set(node, values);
    }
    setInProgress(node, values) {
        const nodeTiming = {
            ...this.getQueued(node),
            startTime: values.startTime,
            timeElapsed: 0,
        };
        this.nodeTimings.set(node, node.type === Graph.BaseNode.types.NETWORK ? { ...nodeTiming, timeElapsedOvershoot: 0, bytesDownloaded: 0 } :
            nodeTiming);
    }
    setCompleted(node, values) {
        const nodeTiming = {
            ...this.getInProgress(node),
            endTime: values.endTime,
            connectionTiming: values.connectionTiming,
        };
        this.nodeTimings.set(node, nodeTiming);
    }
    setCpu(node, values) {
        const nodeTiming = {
            ...this.getCpuStarted(node),
            timeElapsed: values.timeElapsed,
        };
        this.nodeTimings.set(node, nodeTiming);
    }
    setCpuEstimated(node, values) {
        const nodeTiming = {
            ...this.getCpuStarted(node),
            estimatedTimeElapsed: values.estimatedTimeElapsed,
        };
        this.nodeTimings.set(node, nodeTiming);
    }
    setNetwork(node, values) {
        const nodeTiming = {
            ...this.getNetworkStarted(node),
            timeElapsed: values.timeElapsed,
            timeElapsedOvershoot: values.timeElapsedOvershoot,
            bytesDownloaded: values.bytesDownloaded,
        };
        this.nodeTimings.set(node, nodeTiming);
    }
    setNetworkEstimated(node, values) {
        const nodeTiming = {
            ...this.getNetworkStarted(node),
            estimatedTimeElapsed: values.estimatedTimeElapsed,
        };
        this.nodeTimings.set(node, nodeTiming);
    }
    getQueued(node) {
        const timing = this.nodeTimings.get(node);
        if (!timing) {
            throw new Core.LanternError(`Node ${node.id} not yet queued`);
        }
        return timing;
    }
    getCpuStarted(node) {
        const timing = this.nodeTimings.get(node);
        if (!timing) {
            throw new Core.LanternError(`Node ${node.id} not yet queued`);
        }
        if (!('startTime' in timing)) {
            throw new Core.LanternError(`Node ${node.id} not yet started`);
        }
        if ('bytesDownloaded' in timing) {
            throw new Core.LanternError(`Node ${node.id} timing not valid`);
        }
        return timing;
    }
    getNetworkStarted(node) {
        const timing = this.nodeTimings.get(node);
        if (!timing) {
            throw new Core.LanternError(`Node ${node.id} not yet queued`);
        }
        if (!('startTime' in timing)) {
            throw new Core.LanternError(`Node ${node.id} not yet started`);
        }
        if (!('bytesDownloaded' in timing)) {
            throw new Core.LanternError(`Node ${node.id} timing not valid`);
        }
        return timing;
    }
    getInProgress(node) {
        const timing = this.nodeTimings.get(node);
        if (!timing) {
            throw new Core.LanternError(`Node ${node.id} not yet queued`);
        }
        if (!('startTime' in timing)) {
            throw new Core.LanternError(`Node ${node.id} not yet started`);
        }
        if (!('estimatedTimeElapsed' in timing)) {
            throw new Core.LanternError(`Node ${node.id} not yet in progress`);
        }
        return timing;
    }
    getCompleted(node) {
        const timing = this.nodeTimings.get(node);
        if (!timing) {
            throw new Core.LanternError(`Node ${node.id} not yet queued`);
        }
        if (!('startTime' in timing)) {
            throw new Core.LanternError(`Node ${node.id} not yet started`);
        }
        if (!('estimatedTimeElapsed' in timing)) {
            throw new Core.LanternError(`Node ${node.id} not yet in progress`);
        }
        if (!('endTime' in timing)) {
            throw new Core.LanternError(`Node ${node.id} not yet completed`);
        }
        return timing;
    }
}
export { SimulatorTimingMap };
//# sourceMappingURL=SimulationTimingMap.js.map