import type * as Lantern from '../types/types.js';
import { BaseNode } from './BaseNode.js';
declare class NetworkNode<T = Lantern.AnyNetworkObject> extends BaseNode<T> {
    _request: Lantern.NetworkRequest<T>;
    constructor(networkRequest: Lantern.NetworkRequest<T>);
    get type(): 'network';
    get startTime(): number;
    get endTime(): number;
    get rawRequest(): Readonly<T>;
    get request(): Lantern.NetworkRequest<T>;
    get initiatorType(): string;
    get fromDiskCache(): boolean;
    get isNonNetworkProtocol(): boolean;
    /**
     * Returns whether this network request can be downloaded without a TCP connection.
     * During simulation we treat data coming in over a network connection separately from on-device data.
     */
    get isConnectionless(): boolean;
    hasRenderBlockingPriority(): boolean;
    cloneWithoutRelationships(): NetworkNode<T>;
}
export { NetworkNode };
