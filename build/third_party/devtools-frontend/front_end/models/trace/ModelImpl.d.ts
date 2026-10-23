import * as Handlers from './handlers/handlers.js';
import * as Helpers from './helpers/helpers.js';
import type * as Insights from './insights/insights.js';
import * as Types from './types/types.js';
/**
 * The Model is responsible for parsing arrays of raw trace events and storing the
 * resulting data. It can store multiple traces at once, and can return the data for
 * any of them.
 *
 * Most uses of this class should be through `createWithAllHandlers`, but
 * `createWithSubsetOfHandlers` can be used to run just some handlers.
 **/
export declare class Model extends EventTarget {
    #private;
    static createWithAllHandlers(config?: Types.Configuration.Configuration): Model;
    /**
     * Runs only the provided handlers.
     *
     * Callers must ensure they are providing all dependant handlers (although Meta is included automatically),
     * and must know that the result of `.parsedTrace` will be limited to the handlers provided, even though
     * the type won't reflect that.
     */
    static createWithSubsetOfHandlers(traceHandlers: Partial<Handlers.Types.Handlers>, config?: Types.Configuration.Configuration): Model;
    constructor(handlers: Handlers.Types.Handlers, config?: Types.Configuration.Configuration);
    updateConfiguration(config: Types.Configuration.Configuration): void;
    /**
     * Parses an array of trace events into a structured object containing all the
     * information parsed by the trace handlers.
     * You can `await` this function to pause execution until parsing is complete,
     * or instead rely on the `ModuleUpdateEvent` that is dispatched when the
     * parsing is finished.
     *
     * Once parsed, you then have to call the `parsedTrace` method, providing an
     * index of the trace you want to have the data for. This is because any model
     * can store a number of traces. Each trace is given an index, which starts at 0
     * and increments by one as a new trace is parsed.
     *
     * @example
     * // Awaiting the parse method() to block until parsing complete
     * await this.traceModel.parse(events);
     * const data = this.traceModel.parsedTrace(0)
     * @example
     * // Using an event listener to be notified when tracing is complete.
     * this.traceModel.addEventListener(Trace.ModelUpdateEvent.eventName, (event) => {
     *   if(event.data.data === 'done') {
     *     // trace complete
     *     const data = this.traceModel.parsedTrace(0);
     *   }
     * });
     * void this.traceModel.parse(events);
     **/
    parse(traceEvents: readonly Types.Events.Event[], config?: Types.Configuration.ParseOptions): Promise<void>;
    lastTraceIndex(): number;
    /**
     * Returns the parsed trace data indexed by the order in which it was stored.
     * If no index is given, the last stored parsed data is returned.
     */
    parsedTrace(index?: number): ParsedTrace | null;
    overrideModifications(index: number, newModifications: Types.File.Modifications): void;
    syntheticTraceEventsManager(index?: number): Helpers.SyntheticEvents.SyntheticEventsManager | null;
    size(): number;
    deleteTraceByIndex(recordingIndex: number): void;
    indexForTrace(trace: ParsedTrace): number;
    getRecordingsAvailable(): string[];
    resetProcessor(): void;
}
/**
 * This parsed trace is used by the Model. It keeps multiple instances
 * of these so that the user can swap between them. The key is that it is
 * essentially the TraceFile plus whatever the model has parsed from it.
 */
export type ParsedTrace = Types.File.TraceFile & {
    data: Handlers.Types.HandlerData;
    /** Is null for CPU profiles. */
    insights: Insights.Types.TraceInsightSets | null;
    syntheticEventsManager: Helpers.SyntheticEvents.SyntheticEventsManager;
};
export declare enum ModelUpdateType {
    COMPLETE = "COMPLETE",
    PROGRESS_UPDATE = "PROGRESS_UPDATE"
}
export type ModelUpdateEventData = ModelUpdateEventComplete | ModelUpdateEventProgress;
export interface ModelUpdateEventComplete {
    type: ModelUpdateType.COMPLETE;
    data: 'done';
}
export interface ModelUpdateEventProgress {
    type: ModelUpdateType.PROGRESS_UPDATE;
    data: TraceParseEventProgressData;
}
export interface TraceParseEventProgressData {
    percent: number;
}
export declare class ModelUpdateEvent extends Event {
    data: ModelUpdateEventData;
    static readonly eventName = "modelupdate";
    constructor(data: ModelUpdateEventData);
}
export declare function isModelUpdateDataComplete(eventData: ModelUpdateEventData): eventData is ModelUpdateEventComplete;
