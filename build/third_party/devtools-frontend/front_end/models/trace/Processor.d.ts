import * as Handlers from './handlers/handlers.js';
import * as Insights from './insights/insights.js';
import type * as Model from './ModelImpl.js';
import * as Types from './types/types.js';
export declare class TraceParseProgressEvent extends Event {
    data: Model.TraceParseEventProgressData;
    static readonly eventName = "traceparseprogress";
    constructor(data: Model.TraceParseEventProgressData, init?: ConstructorParameters<typeof Event>[1]);
}
export declare class TraceProcessor extends EventTarget {
    #private;
    static createWithAllHandlers(): TraceProcessor;
    /**
     * This function is kept for testing with `stub`.
     */
    static getInsightRunners(): Insights.Types.InsightModelsType;
    constructor(traceHandlers: Partial<Handlers.Types.Handlers>, modelConfiguration?: Types.Configuration.Configuration);
    updateConfiguration(config: Types.Configuration.Configuration): void;
    reset(): void;
    parse(traceEvents: readonly Types.Events.Event[], options: Types.Configuration.ParseOptions): Promise<void>;
    get data(): Handlers.Types.HandlerData | null;
    get insights(): Insights.Types.TraceInsightSets | null;
    /**
     * Sort the insight models based on the impact of each insight's estimated savings, additionally weighted by the
     * worst metrics according to field data (if present).
     */
    sortInsightSet(insightSet: Insights.Types.InsightSet, metadata: Types.File.MetaData | null): void;
}
/**
 * Some Handlers need data provided by others. Dependencies of a handler handler are
 * declared in the `deps` field.
 * @returns A map from trace event handler name to trace event handler whose entries
 * iterate in such a way that each handler is visited after its dependencies.
 */
export declare function sortHandlers(traceHandlers: Partial<Record<Handlers.Types.HandlerName, Handlers.Types.Handler>>): Map<Handlers.Types.HandlerName, Handlers.Types.Handler>;
