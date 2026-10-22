/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools } from '../third_party/index.js';
/**
 * Represents the successful output of processing a performance trace.
 */
export interface TraceResult {
    /** The fully processed trace model output containing event graphs and handler data. */
    parsedTrace: DevTools.TraceEngine.TraceModel.ParsedTrace;
    /** Computed performance insights for navigations in the trace, or null if unavailable. */
    insights: DevTools.TraceEngine.Insights.Types.TraceInsightSets | null;
}
/**
 * Type guard that verifies if an operation returned a valid TraceResult.
 *
 * @param x The result or error object to inspect.
 * @returns True if the object is a TraceResult; otherwise false.
 */
export declare function traceResultIsSuccess(x: TraceResult | TraceParseError): x is TraceResult;
/**
 * Represents an error encountered while reading or parsing a trace buffer.
 */
export interface TraceParseError {
    /** The descriptive error message detailing why trace processing failed. */
    error: string;
}
/**
 * Parses raw JSON trace buffer bytes into a DevTools TraceEngine representation.
 *
 * Accepts either a JSON array of trace events or an object with a `traceEvents` field.
 * Events are parsed in chunks directly from the raw byte buffer to avoid V8 string
 * allocation limits. A new trace engine model is created per call to ensure session
 * isolation and prevent memory retention.
 *
 * @param buffer Raw binary trace data representing trace events and metadata.
 * @param metadata Optional throttling configurations applied during recording; overrides embedded file metadata when defined.
 * @returns A promise resolving to a {@link TraceResult} with parsed traces and insights, or a {@link TraceParseError} on failure.
 */
export declare function parseRawTraceBuffer(buffer: Uint8Array<ArrayBufferLike> | undefined, metadata?: {
    cpuThrottling?: number;
    networkThrottling?: string;
}): Promise<TraceResult | TraceParseError>;
/**
 * Generates a Markdown summary of main thread activity and network metrics from a parsed trace.
 *
 * @param result The parsed trace result to summarize.
 * @param deviceScope Optional CrUX device scope to filter field data.
 * @returns Formatted Markdown text describing performance findings.
 */
export declare function getTraceSummary(result: TraceResult, deviceScope?: DevTools.CrUXManager.DeviceScope | null): string;
/** Identifies a specific performance insight model type supported by the trace engine. */
export type InsightName = keyof DevTools.TraceEngine.Insights.Types.InsightModels;
/** Represents the result of an insight formatting request. */
export type InsightOutput = {
    output: string;
} | {
    error: string;
};
/**
 * Formats a specific performance insight from a parsed trace for display.
 *
 * @param result The parsed trace result containing computed insight sets.
 * @param insightSetId The identifier of the target insight set.
 * @param insightName The name of the insight model to extract.
 * @param deviceScope Optional CrUX device scope to contextualize metrics.
 * @returns An object containing the formatted insight output text or an error message.
 */
export declare function getInsightOutput(result: TraceResult, insightSetId: string, insightName: InsightName, deviceScope?: DevTools.CrUXManager.DeviceScope | null): InsightOutput;
