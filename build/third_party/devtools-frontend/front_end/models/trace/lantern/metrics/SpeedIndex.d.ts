import * as Graph from '../graph/graph.js';
import type * as Simulation from '../simulation/simulation.js';
import { type Extras, Metric, type MetricCoefficients, type MetricComputationDataInput, type MetricResult } from './Metric.js';
declare class SpeedIndex extends Metric {
    static get coefficients(): MetricCoefficients;
    static getScaledCoefficients(rttMs: number): MetricCoefficients;
    static getOptimisticGraph(dependencyGraph: Graph.Node): Graph.Node;
    static getPessimisticGraph(dependencyGraph: Graph.Node): Graph.Node;
    static getEstimateFromSimulation(simulationResult: Simulation.Result, extras: Extras): Simulation.Result;
    static compute(data: MetricComputationDataInput, extras?: Omit<Extras, 'optimistic'>): MetricResult;
    /**
     * Approximate speed index using layout events from the simulated node timings.
     * The layout-based speed index is the weighted average of the endTime of CPU nodes that contained
     * a 'Layout' task. log(duration) is used as the weight to stand for "significance" to the page.
     *
     * If no layout events can be found or the endTime of a CPU task is too early, FCP is used instead.
     *
     * This approach was determined after evaluating the accuracy/complexity tradeoff of many
     * different methods. Read more in the evaluation doc.
     *
     * @see https://docs.google.com/document/d/1qJWXwxoyVLVadezIp_Tgdk867G3tDNkkVRvUJSH3K1E/edit#
     */
    static computeLayoutBasedSpeedIndex(nodeTimings: Simulation.Result['nodeTimings'], fcpTimeInMs: number): number;
}
export { SpeedIndex };
