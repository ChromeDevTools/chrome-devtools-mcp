import * as Handlers from './handlers/handlers.js';
import * as Lantern from './lantern/lantern.js';
import type * as Types from './types/types.js';
type NetworkRequest = Lantern.Types.NetworkRequest<Types.Events.SyntheticNetworkRequest>;
declare function createProcessedNavigation(data: Handlers.Types.HandlerData, frameId: string, navigation: Types.Events.NavigationStart): Lantern.Types.Simulation.ProcessedNavigation;
declare function createNetworkRequests(trace: Lantern.Types.Trace, data: Handlers.Types.HandlerData, startTime?: number, endTime?: number): NetworkRequest[];
declare function createGraph(requests: Lantern.Types.NetworkRequest[], trace: Lantern.Types.Trace, data: Handlers.Types.HandlerData, url?: Lantern.Types.Simulation.URL): Lantern.Graph.Node<Types.Events.SyntheticNetworkRequest>;
export { createGraph, createNetworkRequests, createProcessedNavigation, };
