import * as Graph from '../graph/graph.js';
import type * as Simulation from '../simulation/simulation.js';
import type * as Types from '../types/types.js';
export interface MetricComputationDataInput {
    simulator: Simulation.Simulator;
    graph: Graph.Node<unknown>;
    processedNavigation: Types.Simulation.ProcessedNavigation;
}
export interface MetricCoefficients {
    intercept: number;
    optimistic: number;
    pessimistic: number;
}
export interface MetricResult<T = Types.AnyNetworkObject> {
    timing: number;
    timestamp?: never;
    optimisticEstimate: Simulation.Result<T>;
    pessimisticEstimate: Simulation.Result<T>;
    optimisticGraph: Graph.Node<T>;
    pessimisticGraph: Graph.Node;
}
export interface Extras {
    optimistic: boolean;
    fcpResult?: MetricResult;
    lcpResult?: MetricResult;
    interactiveResult?: MetricResult;
    observedSpeedIndex?: number;
}
declare class Metric {
    static getScriptUrls(dependencyGraph: Graph.Node, treatNodeAsRenderBlocking?: (node: Graph.NetworkNode) => boolean): Set<string>;
    static get coefficients(): MetricCoefficients;
    /**
     * Returns the coefficients, scaled by the throttling settings if needed by the metric.
     * Some lantern metrics (speed-index) use components in their estimate that are not
     * from the simulator. In this case, we need to adjust the coefficients as the target throttling
     * settings change.
     */
    static getScaledCoefficients(_rttMs: number): MetricCoefficients;
    static getOptimisticGraph(_dependencyGraph: Graph.Node, _processedNavigation: Types.Simulation.ProcessedNavigation): Graph.Node;
    static getPessimisticGraph(_dependencyGraph: Graph.Node, _processedNavigation: Types.Simulation.ProcessedNavigation): Graph.Node;
    static getEstimateFromSimulation(simulationResult: Simulation.Result, _extras: Extras): Simulation.Result;
    static compute(data: MetricComputationDataInput, extras?: Omit<Extras, 'optimistic'>): MetricResult;
}
export { Metric };
