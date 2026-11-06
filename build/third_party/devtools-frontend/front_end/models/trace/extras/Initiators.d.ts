import type * as Handlers from '../handlers/handlers.js';
import type * as Types from '../types/types.js';
/**
 * There are bugs in the backend tracing that means that network requests are
 * often incorrectly tied to an initiator. This function exists as a utility to
 * look up an event's initiator regardless of the type of event, but also to
 * provide a post-parsing fix for network initiators.
 * The TL;DR is that images injected by a script will incorrectly have their
 * initiator set to the root document. To fix this, we look at the stack trace
 * when the request was sent, and use that.
 */
export declare function getNetworkInitiator(data: Handlers.Types.HandlerData, event: Types.Events.SyntheticNetworkRequest): Types.Events.SyntheticNetworkRequest | undefined;
