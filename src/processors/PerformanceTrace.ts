/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools} from '../third_party/index.js';
import {logger} from '../utils/logger.js';
import {parseTraceEventsFromBuffer} from './ChunkedTraceParser.js';

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
 * @param x - The result or error object to inspect.
 * @returns True if the object is a TraceResult; otherwise false.
 */
export function traceResultIsSuccess(
  x: TraceResult | TraceParseError,
): x is TraceResult {
  return 'parsedTrace' in x;
}

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
 * @param buffer - Raw binary trace data representing trace events and metadata.
 * @param metadata - Optional throttling configurations applied during recording; overrides embedded file metadata when defined.
 * @returns A promise resolving to a {@link TraceResult} with parsed traces and insights, or a {@link TraceParseError} on failure.
 */
export async function parseRawTraceBuffer(
  buffer: Uint8Array<ArrayBufferLike> | undefined,
  metadata?: {
    cpuThrottling?: number;
    networkThrottling?: string;
  },
): Promise<TraceResult | TraceParseError> {
  if (!buffer || buffer.length === 0) {
    return {
      error: 'No buffer was provided.',
    };
  }
  try {
    const {events, metadata: fileMetadata} = parseTraceEventsFromBuffer(buffer);
    if (events.length === 0) {
      return {
        error: 'No trace events were found in the trace buffer.',
      };
    }
    const combinedMetadata: DevTools.TraceEngine.Types.File.MetaData = {
      ...fileMetadata,
      ...(metadata?.cpuThrottling !== undefined
        ? {cpuThrottling: metadata.cpuThrottling}
        : {}),
      ...(metadata?.networkThrottling !== undefined
        ? {networkThrottling: metadata.networkThrottling}
        : {}),
    };
    const hasMetadata = Object.keys(combinedMetadata).length > 0;

    // Instantiate a fresh TraceModel per invocation because Model permanently
    // retains parsed traces in its internal `#traces` array, which causes an
    // unbounded memory leak if reused across sessions.
    const engine =
      DevTools.TraceEngine.TraceModel.Model.createWithAllHandlers();
    await engine.parse(events, {
      metadata: hasMetadata ? combinedMetadata : undefined,
    });
    const parsedTrace = engine.parsedTrace();
    if (!parsedTrace) {
      return {
        error: 'No parsed trace was returned from the trace engine.',
      };
    }

    const insights = parsedTrace.insights ?? null;

    return {
      parsedTrace,
      insights,
    };
  } catch (e) {
    const errorText = e instanceof Error ? e.message : JSON.stringify(e);
    logger?.(`Unexpected error parsing trace: ${errorText}`);
    return {
      error: errorText,
    };
  }
}

const extraFormatDescriptions = `Information on performance traces may contain main thread activity represented as call frames and network requests.

${DevTools.PerformanceTraceFormatter.callFrameDataFormatDescription}

${DevTools.PerformanceTraceFormatter.networkDataFormatDescription}`;

/**
 * Generates a Markdown summary of main thread activity and network metrics from a parsed trace.
 *
 * @param result - The parsed trace result to summarize.
 * @param deviceScope - Optional CrUX device scope to filter field data.
 * @returns Formatted Markdown text describing performance findings.
 */
export function getTraceSummary(
  result: TraceResult,
  deviceScope?: DevTools.CrUXManager.DeviceScope | null,
): string {
  const focus = DevTools.AgentFocus.fromParsedTrace(result.parsedTrace);
  const formatter = new DevTools.PerformanceTraceFormatter(focus, deviceScope);
  const summaryText = formatter.formatTraceSummary();
  return `## Summary of Performance trace findings:
${summaryText}

## Details on call tree & network request formats:
${extraFormatDescriptions}`;
}

/** Identifies a specific performance insight model type supported by the trace engine. */
export type InsightName =
  keyof DevTools.TraceEngine.Insights.Types.InsightModels;

/** Represents the result of an insight formatting request. */
export type InsightOutput = {output: string} | {error: string};

/**
 * Formats a specific performance insight from a parsed trace for display.
 *
 * @param result - The parsed trace result containing computed insight sets.
 * @param insightSetId - The identifier of the target insight set.
 * @param insightName - The name of the insight model to extract.
 * @param deviceScope - Optional CrUX device scope to contextualize metrics.
 * @returns An object containing the formatted insight output text or an error message.
 */
export function getInsightOutput(
  result: TraceResult,
  insightSetId: string,
  insightName: InsightName,
  deviceScope?: DevTools.CrUXManager.DeviceScope | null,
): InsightOutput {
  if (!result.insights) {
    return {
      error: 'No Performance insights are available for this trace.',
    };
  }

  const insightSet = result.insights.get(insightSetId);
  if (!insightSet) {
    return {
      error:
        'No Performance Insights for the given insight set id. Only use ids given in the "Available insight sets" list.',
    };
  }

  const matchingInsight =
    insightName in insightSet.model ? insightSet.model[insightName] : null;
  if (!matchingInsight) {
    return {
      error: `No Insight with the name ${insightName} found. Double check the name you provided is accurate and try again.`,
    };
  }

  const formatter = new DevTools.PerformanceInsightFormatter(
    DevTools.AgentFocus.fromParsedTrace(result.parsedTrace),
    matchingInsight,
    deviceScope,
  );
  return {output: formatter.formatInsight()};
}
