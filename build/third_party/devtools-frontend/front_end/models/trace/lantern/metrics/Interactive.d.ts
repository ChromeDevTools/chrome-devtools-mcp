import * as Graph from '../graph/graph.js';
import type * as Simulation from '../simulation/simulation.js';
import { type Extras, Metric, type MetricCoefficients, type MetricComputationDataInput, type MetricResult } from './Metric.js';
declare class Interactive extends Metric {
    static get coefficients(): MetricCoefficients;
    static getOptimisticGraph<T>(dependencyGraph: Graph.Node<T>): Graph.Node<T>;
    static getPessimisticGraph<T>(dependencyGraph: Graph.Node<T>): Graph.Node<T>;
    static getEstimateFromSimulation(simulationResult: Simulation.Result, extras: Extras): Simulation.Result;
    static compute(data: MetricComputationDataInput, extras?: Omit<Extras, 'optimistic'>): MetricResult;
    static getLastLongTaskEndTime(nodeTimings: Simulation.Result['nodeTimings'], duration?: number): number;
}
export { Interactive };
