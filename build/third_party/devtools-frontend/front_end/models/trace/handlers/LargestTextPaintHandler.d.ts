import type * as Protocol from '../../../generated/protocol.js';
import * as Types from '../types/types.js';
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): Map<Protocol.DOM.BackendNodeId, Types.Events.LargestTextPaintCandidate>;
