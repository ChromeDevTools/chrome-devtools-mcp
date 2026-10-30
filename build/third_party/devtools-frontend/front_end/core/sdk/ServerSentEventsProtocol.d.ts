import type * as Protocol from '../../generated/protocol.js';
/**
 * Implements Server-Sent-Events protocl parsing as described by
 * https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream
 *
 * Webpages can use SSE over fetch/XHR and not go through EventSource. DevTools
 * only receives the raw binary data in this case, which means we have to decode
 * and parse the event stream ourselves here.
 *
 * Implementation mostly ported over from blink
 * third_party/blink/renderer/modules/eventsource/event_source_parser.cc.
 */
export declare class ServerSentEventsParser {
    #private;
    constructor(callback: (eventType: string, data: string, eventId: string) => void, encodingLabel?: string);
    addBase64Chunk(raw: Protocol.binary): Promise<void>;
    addTextChunk(chunk: string): void;
}
