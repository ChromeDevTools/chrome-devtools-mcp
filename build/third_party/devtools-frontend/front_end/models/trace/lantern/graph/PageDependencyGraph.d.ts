import type * as Lantern from '../types/types.js';
import type { Node } from './BaseNode.js';
import { CPUNode } from './CPUNode.js';
import { NetworkNode } from './NetworkNode.js';
interface NetworkNodeOutput {
    nodes: NetworkNode[];
    idToNodeMap: Map<string, NetworkNode>;
    urlToNodeMap: Map<string, NetworkNode[]>;
    frameIdToNodeMap: Map<string, NetworkNode | null>;
}
declare class PageDependencyGraph {
    static getNetworkInitiators(request: Lantern.NetworkRequest): string[];
    static getNetworkNodeOutput(networkRequests: Lantern.NetworkRequest[]): NetworkNodeOutput;
    static isScheduleableTask(evt: Lantern.TraceEvent): boolean;
    /**
     * There should *always* be at least one top level event, having 0 typically means something is
     * drastically wrong with the trace and we should just give up early and loudly.
     */
    static assertHasToplevelEvents(events: Lantern.TraceEvent[]): void;
    static getCPUNodes(mainThreadEvents: Lantern.TraceEvent[]): CPUNode[];
    static linkNetworkNodes(rootNode: NetworkNode, networkNodeOutput: NetworkNodeOutput): void;
    static linkCPUNodes(rootNode: Node, networkNodeOutput: NetworkNodeOutput, cpuNodes: CPUNode[]): void;
    /**
     * Removes the given node from the graph, but retains all paths between its dependencies and
     * dependents.
     */
    static pruneNode(node: Node): void;
    /**
     * TODO: remove when CDT backend in Lighthouse is gone. Until then, this is a useful debugging tool
     * to find delta between using CDP or the trace to create the network requests.
     *
     * When a test fails using the trace backend, I enabled this debug method and copied the network
     * requests when CDP was used, then when trace is used, and diff'd them. This method helped
     * remove non-logical differences from the comparison (order of properties, slight rounding
     * discrepancies, removing object cycles, etc).
     *
     * When using for a unit test, make sure to do `.only` so you are getting what you expect.
     */
    static debugNormalizeRequests(lanternRequests: Lantern.NetworkRequest[]): void;
    static createGraph(mainThreadEvents: Lantern.TraceEvent[], networkRequests: Lantern.NetworkRequest[], url: Lantern.Simulation.URL): Node;
    static printGraph(rootNode: Node, widthInCharacters?: number): void;
}
export { PageDependencyGraph };
