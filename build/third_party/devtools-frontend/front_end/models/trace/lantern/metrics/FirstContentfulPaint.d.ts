import * as Graph from '../graph/graph.js';
import type * as Types from '../types/types.js';
import { Metric, type MetricCoefficients } from './Metric.js';
interface FirstPaintBasedGraphOpts<T> {
    /**
     * The timestamp used to filter out tasks that occurred after our paint of interest.
     * Typically this is First Contentful Paint or First Meaningful Paint.
     */
    cutoffTimestamp: number;
    /**
     * The function that determines which resources should be considered *possibly*
     * render-blocking.
     */
    treatNodeAsRenderBlocking: (node: Graph.NetworkNode<T>) => boolean;
    /**
     * The function that determines which CPU nodes should also be included in our
     * blocking node IDs set, beyond what getRenderBlockingNodeData() already includes.
     */
    additionalCpuNodesToTreatAsRenderBlocking?: (node: Graph.CPUNode) => boolean;
}
declare class FirstContentfulPaint extends Metric {
    static get coefficients(): MetricCoefficients;
    /**
     * Computes the set of URLs that *appeared* to be render-blocking based on our filter,
     * *but definitely were not* render-blocking based on the timing of their EvaluateScript task.
     * It also computes the set of corresponding CPU node ids that were needed for the paint at the
     * given timestamp.
     */
    static getRenderBlockingNodeData<T = unknown>(graph: Graph.Node, { cutoffTimestamp, treatNodeAsRenderBlocking, additionalCpuNodesToTreatAsRenderBlocking }: FirstPaintBasedGraphOpts<T>): {
        definitelyNotRenderBlockingScriptUrls: Set<string>;
        renderBlockingCpuNodeIds: Set<string>;
    };
    /**
     * Computes the graph required for the first paint of interest.
     */
    static getFirstPaintBasedGraph<T>(dependencyGraph: Graph.Node, { cutoffTimestamp, treatNodeAsRenderBlocking, additionalCpuNodesToTreatAsRenderBlocking }: FirstPaintBasedGraphOpts<T>): Graph.Node<T>;
    static getOptimisticGraph<T>(dependencyGraph: Graph.Node<T>, processedNavigation: Types.Simulation.ProcessedNavigation): Graph.Node<T>;
    static getPessimisticGraph<T>(dependencyGraph: Graph.Node<T>, processedNavigation: Types.Simulation.ProcessedNavigation): Graph.Node<T>;
}
export { FirstContentfulPaint };
