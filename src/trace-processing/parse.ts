/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {PerformanceTraceFormatter} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/PerformanceTraceFormatter.js';
import {PerformanceInsightFormatter} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/PerformanceInsightFormatter.js';
import * as TraceEngine from '../../node_modules/chrome-devtools-frontend/front_end/models/trace/trace.js';
import {logger} from '../logger.js';
import {AgentFocus} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/performance/AIContext.js';

const engine = TraceEngine.TraceModel.Model.createWithAllHandlers();

export interface TraceResult {
  parsedTrace: TraceEngine.TraceModel.ParsedTrace;
  insights: TraceEngine.Insights.Types.TraceInsightSets;
}

export async function parseRawTraceBuffer(
  buffer: Uint8Array<ArrayBufferLike> | undefined,
): Promise<TraceResult | null> {
  engine.resetProcessor();
  if (!buffer) {
    return null;
  }
  const asString = new TextDecoder().decode(buffer);
  if (!asString) {
    return null;
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
      return null;
    }

    const insights = parsedTrace?.insights;
    if (!insights) {
      return null;
    }

    return {
      parsedTrace,
      insights,
    };
  } catch (e) {
    if (e instanceof Error) {
      logger(`Error parsing trace: ${e.message}`);
    } else {
      logger(`Error parsing trace: ${JSON.stringify(e)}`);
    }
    return null;
  }
}

export function getTraceSummary(result: TraceResult): string {
  const focus = AgentFocus.full(result.parsedTrace);
  const serializer = new TraceEngine.EventsSerializer.EventsSerializer();
  const formatter = new PerformanceTraceFormatter(focus, serializer);
  const output = formatter.formatTraceSummary();
  return output;
}

export type InsightName = keyof TraceEngine.Insights.Types.InsightModels;
export type InsightOutput = {output: string} | {error: string};

export function getInsightOutput(
  result: TraceResult,
  insightName: InsightName,
): InsightOutput {
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
    result.parsedTrace,
    matchingInsight,
  );
  return {output: formatter.formatInsight()};
}
