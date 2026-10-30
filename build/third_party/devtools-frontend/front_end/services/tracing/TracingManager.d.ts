import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import type * as Trace from '../../models/trace/trace.js';
export declare class TracingManager extends SDK.SDKModel.SDKModel<void> {
    #private;
    constructor(target: SDK.Target.Target);
    bufferUsage(usage?: number, percentFull?: number): void;
    eventsCollected(events: Trace.Types.Events.Event[]): void;
    tracingComplete(): void;
    reset(): Promise<void>;
    start(client: TracingManagerClient, categoryFilter: string, options?: TracingStartOptions): Promise<Protocol.ProtocolResponseWithError>;
    stop(): void;
}
export interface TracingManagerClient {
    traceEventsCollected(events: Trace.Types.Events.Event[]): void;
    tracingComplete(): void;
    tracingBufferUsage(usage: number): void;
    eventsRetrievalProgress(progress: number): void;
}
/**
 * Optional knobs that control how the `disabled-by-default-devtools.screenshot`
 * tracing category captures frames. See `Tracing.start` in the protocol for
 * details and per-session memory budget.
 */
export interface TracingStartOptions {
    /**
     * Maximum width and height (in pixels) of each captured screenshot.
     * When omitted the backend default (500) is used.
     */
    screenshotMaxSize?: number;
    /**
     * Maximum number of screenshots captured during a single tracing session.
     * When omitted the backend default (450) is used.
     */
    screenshotMaxCount?: number;
}
