import * as Trace from '../../../models/trace/trace.js';
import { AICallTree } from './AICallTree.js';
interface AgentFocusData {
    parsedTrace: Trace.TraceModel.ParsedTrace;
    /** Note: at most one of event or callTree is non-null. */
    event: Trace.Types.Events.Event | null;
    /** Note: at most one of event or callTree is non-null. */
    callTree: AICallTree | null;
    insight: Trace.Insights.Types.InsightModel | null;
}
export declare class AgentFocus {
    #private;
    static fromParsedTrace(parsedTrace: Trace.TraceModel.ParsedTrace): AgentFocus;
    static fromInsight(parsedTrace: Trace.TraceModel.ParsedTrace, insight: Trace.Insights.Types.InsightModel): AgentFocus;
    static fromEvent(parsedTrace: Trace.TraceModel.ParsedTrace, event: Trace.Types.Events.Event): AgentFocus;
    static fromCallTree(callTree: AICallTree): AgentFocus;
    readonly eventsSerializer: Trace.EventsSerializer.EventsSerializer;
    constructor(data: AgentFocusData);
    get parsedTrace(): Trace.TraceModel.ParsedTrace;
    get primaryInsightSet(): Trace.Insights.Types.InsightSet | null;
    /** Note: at most one of event or callTree is non-null. */
    get event(): Trace.Types.Events.Event | null;
    /** Note: at most one of event or callTree is non-null. */
    get callTree(): AICallTree | null;
    get insight(): Trace.Insights.Types.InsightModel | null;
    withInsight(insight: Trace.Insights.Types.InsightModel | null): AgentFocus;
    withEvent(event: Trace.Types.Events.Event | null): AgentFocus;
    lookupEvent(key: string): Trace.Types.Events.Event | null;
}
export declare function getPerformanceAgentFocusFromModel(model: Trace.TraceModel.Model): AgentFocus | null;
export {};
