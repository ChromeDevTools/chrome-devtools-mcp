/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {PerformanceInsightFormatter} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/PerformanceInsightFormatter.js';
import {PerformanceTraceFormatter} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/PerformanceTraceFormatter.js';
import {AgentFocus} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/performance/AIContext.js';
import * as TraceEngine from '../../node_modules/chrome-devtools-frontend/front_end/models/trace/trace.js';
import {logger} from '../logger.js';

const engine = TraceEngine.TraceModel.Model.createWithAllHandlers();

/**
 * Represents the successful result of parsing a performance trace.
 * @public
 */
export interface TraceResult {
  /**
   * The parsed trace data from the trace engine.
   */
  parsedTrace: TraceEngine.TraceModel.ParsedTrace;
  /**
   * The performance insights extracted from the trace, or null if none.
   */
  insights: TraceEngine.Insights.Types.TraceInsightSets | null;
}

/**
 * Type guard to check if a trace parsing result was successful.
 *
 * @param x - The result to check.
 * @returns True if the result is a successful TraceResult, false otherwise.
 * @public
 */
export function traceResultIsSuccess(
  x: TraceResult | TraceParseError,
): x is TraceResult {
  return 'parsedTrace' in x;
}

/**
 * Represents an error that occurred during trace parsing.
 * @public
 */
export interface TraceParseError {
  /**
   * The error message.
   */
  error: string;
}

/**
 * Parses a raw performance trace buffer into a structured TraceResult.
 *
 * @param buffer - The raw trace data as a Uint8Array.
 * @returns A promise that resolves to a TraceResult on success, or a
 * TraceParseError on failure.
 * @public
 */
export async function parseRawTraceBuffer(
  buffer: Uint8Array<ArrayBufferLike> | undefined,
): Promise<TraceResult | TraceParseError> {
  engine.resetProcessor();
  if (!buffer) {
    return {
      error: 'No buffer was provided.',
    };
  }
  const asString = new TextDecoder().decode(buffer);
  if (!asString) {
    return {
      error: 'Decoding the trace buffer returned an empty string.',
    };
  }
  try {
    const data = JSON.parse(asString) as
      | {
          traceEvents: TraceEngine.Types.Events.Event[];
        }
      | TraceEngine.Types.Events.Event[];

    const events = Array.isArray(data) ? data : data.traceEvents;
    await engine.parse(events);
    const parsedTrace = engine.parsedTrace();
    if (!parsedTrace) {
      return {
        error: 'No parsed trace was returned from the trace engine.',
      };
    }

    const insights = parsedTrace?.insights ?? null;

    return {
      parsedTrace,
      insights,
    };
  } catch (e) {
    const errorText = e instanceof Error ? e.message : JSON.stringify(e);
    logger(`Unexpected error parsing trace: ${errorText}`);
    return {
      error: errorText,
    };
  }
}

const extraFormatDescriptions = `Information on performance traces may contain main thread activity represented as call frames and network requests.

${PerformanceTraceFormatter.callFrameDataFormatDescription}

${PerformanceTraceFormatter.networkDataFormatDescription}
`;
/**
 * Generates a high-level summary of a parsed performance trace.
 *
 * @param result - The successful trace parsing result.
 * @returns A string containing the trace summary.
 * @public
 */
export function getTraceSummary(result: TraceResult): string {
  const focus = AgentFocus.fromParsedTrace(result.parsedTrace);
  const formatter = new PerformanceTraceFormatter(focus);
  const output = formatter.formatTraceSummary();
  return `${extraFormatDescriptions}

${output}`;
}

/**
 * The names of the available performance insights.
 * @public
 */
export type InsightName = keyof TraceEngine.Insights.Types.InsightModels;
/**
 * The output of an insight analysis, which can be either the formatted output
 * string or an error.
 * @public
 */
export type InsightOutput = {output: string} | {error: string};

/**
 * Gets the detailed output for a specific performance insight from a trace result.
 *
 * @param result - The successful trace parsing result.
 * @param insightName - The name of the insight to analyze.
 * @returns An object containing either the formatted output string or an error
 * message.
 * @public
 */
export function getInsightOutput(
  result: TraceResult,
  insightName: InsightName,
): InsightOutput {
  if (!result.insights) {
    return {
      error: 'No Performance insights are available for this trace.',
    };
  }

  // Currently, we do not support inspecting traces with multiple navigations. We either:
  // 1. Find Insights from the first navigation (common case: user records a trace with a page reload to test load performance)
  // 2. Fall back to finding Insights not associated with a navigation (common case: user tests an interaction without a page load).
  const mainNavigationId =
    result.parsedTrace.data.Meta.mainFrameNavigations.at(0)?.args.data
      ?.navigationId;

  const insightsForNav = result.insights.get(
    mainNavigationId ?? TraceEngine.Types.Events.NO_NAVIGATION,
  );

  if (!insightsForNav) {
    return {
      error: 'No Performance Insights for this trace.',
    };
  }

  const matchingInsight =
    insightName in insightsForNav.model
      ? insightsForNav.model[insightName]
      : null;
  if (!matchingInsight) {
    return {
      error: `No Insight with the name ${insightName} found. Double check the name you provided is accurate and try again.`,
    };
  }

  const formatter = new PerformanceInsightFormatter(
    AgentFocus.fromParsedTrace(result.parsedTrace),
    matchingInsight,
  );
  return {output: formatter.formatInsight()};
}
