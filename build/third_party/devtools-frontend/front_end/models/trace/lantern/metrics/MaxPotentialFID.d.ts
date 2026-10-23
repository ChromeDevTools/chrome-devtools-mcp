import * as Graph from '../graph/graph.js';
import type * as Simulation from '../simulation/simulation.js';
import { type Extras, Metric, type MetricCoefficients, type MetricComputationDataInput, type MetricResult } from './Metric.js';
declare class MaxPotentialFID extends Metric {
    static get coefficients(): MetricCoefficients;
    static getOptimisticGraph(dependencyGraph: Graph.Node): Graph.Node;
    static getPessimisticGraph(dependencyGraph: Graph.Node): Graph.Node;
    static getEstimateFromSimulation(simulation: Simulation.Result, extras: Extras): Simulation.Result;
    static compute(data: MetricComputationDataInput, extras?: Omit<Extras, 'optimistic'>): MetricResult;
    static getTimingsAfterFCP(nodeTimings: Simulation.Result['nodeTimings'], fcpTimeInMs: number): Array<{
        duration: number;
    }>;
}
export { MaxPotentialFID };
