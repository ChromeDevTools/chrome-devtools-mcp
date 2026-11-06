import { type EventSourceMessage, type NetworkRequest } from './NetworkRequest.js';
/**
 * Server sent events only arrive via CDP (Explicit Network.eventSourceMessageReceived) when
 * the page uses "EventSource" in the code.
 *
 * If the page manually uses 'fetch' or XHR we have to do the protocol parsing
 * ourselves.
 *
 * `ServerSentEvents` is a small helper class that manages this distinction for a specific
 * request, stores the event data and sends out "EventSourceMessageAdded" events for a request.
 */
export declare class ServerSentEvents {
    #private;
    constructor(request: NetworkRequest, parseFromStreamedData: boolean);
    get eventSourceMessages(): readonly EventSourceMessage[];
    /** Forwarded Network.eventSourceMessage received */
    onProtocolEventSourceMessageReceived(eventName: string, data: string, eventId: string, time: number): void;
}
