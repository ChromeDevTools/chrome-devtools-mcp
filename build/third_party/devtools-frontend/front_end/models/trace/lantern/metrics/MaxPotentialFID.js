// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Core from '../core/core.js';
import * as Graph from '../graph/graph.js';
import { Metric, } from './Metric.js';
class MaxPotentialFID extends Metric {
    static get coefficients() {
        return {
            intercept: 0,
            optimistic: 0.5,
            pessimistic: 0.5,
        };
    }
    static getOptimisticGraph(dependencyGraph) {
        return dependencyGraph;
    }
    static getPessimisticGraph(dependencyGraph) {
        return dependencyGraph;
    }
    static getEstimateFromSimulation(simulation, extras) {
        if (!extras.fcpResult) {
            throw new Core.LanternError('missing fcpResult');
        }
        // Intentionally use the opposite FCP estimate, a more pessimistic FCP means that more tasks
        // are excluded from the FID computation, so a higher FCP means lower FID for same work.
        const fcpTimeInMs = extras.optimistic ? extras.fcpResult.pessimisticEstimate.timeInMs :
            extras.fcpResult.optimisticEstimate.timeInMs;
        const timings = MaxPotentialFID.getTimingsAfterFCP(simulation.nodeTimings, fcpTimeInMs);
        return {
            timeInMs: Math.max(...timings.map(timing => timing.duration), 16),
            nodeTimings: simulation.nodeTimings,
        };
    }
    static compute(data, extras) {
        const fcpResult = extras?.fcpResult;
        if (!fcpResult) {
            throw new Core.LanternError('FCP is required to calculate the Max Potential FID metric');
        }
        return super.compute(data, extras);
    }
    static getTimingsAfterFCP(nodeTimings, fcpTimeInMs) {
        return Array.from(nodeTimings.entries())
            .filter(([node, timing]) => node.type === Graph.BaseNode.types.CPU && timing.endTime > fcpTimeInMs)
            .map(([_, timing]) => timing);
    }
}
export { MaxPotentialFID };
//# sourceMappingURL=MaxPotentialFID.js.map