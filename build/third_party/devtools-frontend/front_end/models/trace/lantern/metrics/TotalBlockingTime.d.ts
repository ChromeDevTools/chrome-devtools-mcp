import * as Graph from '../graph/graph.js';
import type * as Simulation from '../simulation/simulation.js';
import { type Extras, Metric, type MetricCoefficients, type MetricComputationDataInput, type MetricResult } from './Metric.js';
declare class TotalBlockingTime extends Metric {
    static get coefficients(): MetricCoefficients;
    static getOptimisticGraph(dependencyGraph: Graph.Node): Graph.Node;
    static getPessimisticGraph(dependencyGraph: Graph.Node): Graph.Node;
    static getEstimateFromSimulation(simulation: Simulation.Result, extras: Extras): Simulation.Result;
    static compute(data: MetricComputationDataInput, extras?: Omit<Extras, 'optimistic'>): MetricResult;
    static getTopLevelEvents(nodeTimings: Simulation.Result['nodeTimings'], minDurationMs: number): Array<{
        start: number;
        end: number;
        duration: number;
    }>;
}
export { TotalBlockingTime };
