import * as Protocol from '../../../generated/protocol.js';
import type * as Types from '../types/types.js';
type SyntheticNetworkRequest = Types.Events.SyntheticNetworkRequest;
export declare function isSyntheticNetworkRequestEventRenderBlocking(event: SyntheticNetworkRequest): boolean;
export declare function isSyntheticNetworkRequestHighPriority(event: SyntheticNetworkRequest): boolean;
export interface CacheControl {
    'max-age'?: number;
    'no-cache'?: boolean;
    'no-store'?: boolean;
    'must-revalidate'?: boolean;
    'private'?: boolean;
}
export declare const CACHEABLE_STATUS_CODES: Set<number>;
/** @type {Set<LH.Crdp.Network.ResourceType>} */
export declare const STATIC_RESOURCE_TYPES: Set<Protocol.Network.ResourceType>;
export declare const NON_NETWORK_SCHEMES: string[];
/**
 * Parses Cache-Control directives based on https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
 * eg. 'no-cache, no-store, max-age=0, no-transform, private' will return
 * {no-cache: true, no-store: true, max-age: 0, no-transform: true, private: true}
 */
export declare function parseCacheControl(header: string | null): CacheControl | null;
/**
 * Is the host localhost-enough to satisfy the "secure context" definition
 * https://github.com/GoogleChrome/lighthouse/pull/11766#discussion_r582340683
 */
export declare function isSyntheticNetworkRequestLocalhost(event: SyntheticNetworkRequest): boolean;
export {};
