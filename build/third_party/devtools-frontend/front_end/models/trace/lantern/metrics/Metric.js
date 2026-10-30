// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Core from '../core/core.js';
import * as Graph from '../graph/graph.js';
class Metric {
    static getScriptUrls(dependencyGraph, treatNodeAsRenderBlocking) {
        const scriptUrls = new Set();
        dependencyGraph.traverse(node => {
            if (node.type !== Graph.BaseNode.types.NETWORK) {
                return;
            }
            if (node.request.resourceType !== 'Script') {
                return;
            }
            if (treatNodeAsRenderBlocking?.(node)) {
                scriptUrls.add(node.request.url);
            }
        });
        return scriptUrls;
    }
    static get coefficients() {
        throw new Core.LanternError('coefficients unimplemented!');
    }
    /**
     * Returns the coefficients, scaled by the throttling settings if needed by the metric.
     * Some lantern metrics (speed-index) use components in their estimate that are not
     * from the simulator. In this case, we need to adjust the coefficients as the target throttling
     * settings change.
     */
    static getScaledCoefficients(_rttMs) {
        return this.coefficients;
    }
    static getOptimisticGraph(_dependencyGraph, _processedNavigation) {
        throw new Core.LanternError('Optimistic graph unimplemented!');
    }
    static getPessimisticGraph(_dependencyGraph, _processedNavigation) {
        throw new Core.LanternError('Pessmistic graph unimplemented!');
    }
    static getEstimateFromSimulation(simulationResult, _extras) {
        return simulationResult;
    }
    static compute(data, extras) {
        const { simulator, graph, processedNavigation } = data;
        const metricName = this.name.replace('Lantern', '');
        const optimisticGraph = this.getOptimisticGraph(graph, processedNavigation);
        const pessimisticGraph = this.getPessimisticGraph(graph, processedNavigation);
        let simulateOptions = { label: `optimistic${metricName}` };
        const optimisticSimulation = simulator.simulate(optimisticGraph, simulateOptions);
        simulateOptions = { label: `pessimistic${metricName}` };
        const pessimisticSimulation = simulator.simulate(pessimisticGraph, simulateOptions);
        const optimisticEstimate = this.getEstimateFromSimulation(optimisticSimulation, { ...extras, optimistic: true });
        const pessimisticEstimate = this.getEstimateFromSimulation(pessimisticSimulation, { ...extras, optimistic: false });
        const coefficients = this.getScaledCoefficients(simulator.rtt);
        // Estimates under 1s don't really follow the normal curve fit, minimize the impact of the intercept
        const interceptMultiplier = coefficients.intercept > 0 ? Math.min(1, optimisticEstimate.timeInMs / 1000) : 1;
        const timing = coefficients.intercept * interceptMultiplier +
            coefficients.optimistic * optimisticEstimate.timeInMs + coefficients.pessimistic * pessimisticEstimate.timeInMs;
        return {
            timing,
            optimisticEstimate,
            pessimisticEstimate,
            optimisticGraph,
            pessimisticGraph,
        };
    }
}
export { Metric };
//# sourceMappingURL=Metric.js.map