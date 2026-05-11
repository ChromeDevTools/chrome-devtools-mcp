/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {DevTools} from '../third_party/index.js';

const engine = DevTools.TraceEngine.TraceModel.Model.createWithAllHandlers();

export interface TraceResult {
  parsedTrace: DevTools.TraceEngine.TraceModel.ParsedTrace;
  insights: DevTools.TraceEngine.Insights.Types.TraceInsightSets | null;
}

export function traceResultIsSuccess(
  x: TraceResult | TraceParseError,
): x is TraceResult {
  return 'parsedTrace' in x;
}

export interface TraceParseError {
  error: string;
}

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
          traceEvents: DevTools.TraceEngine.Types.Events.Event[];
        }
      | DevTools.TraceEngine.Types.Events.Event[];

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

${DevTools.PerformanceTraceFormatter.callFrameDataFormatDescription}

${DevTools.PerformanceTraceFormatter.networkDataFormatDescription}`;

export function getTraceSummary(result: TraceResult): string {
  const focus = DevTools.AgentFocus.fromParsedTrace(result.parsedTrace);
  const formatter = new DevTools.PerformanceTraceFormatter(focus);
  const summaryText = addFieldMetricRatings(formatter.formatTraceSummary());
  return `## Summary of Performance trace findings:
${summaryText}

## Details on call tree & network request formats:
${extraFormatDescriptions}`;
}

type MetricRating = 'good' | 'needs improvement' | 'poor';

const FIELD_METRIC_THRESHOLDS = new Map<
  string,
  {good: number; needsImprovement: number}
>([
  ['LCP', {good: 2500, needsImprovement: 4000}],
  ['INP', {good: 200, needsImprovement: 500}],
  ['CLS', {good: 0.1, needsImprovement: 0.25}],
  ['FCP', {good: 1800, needsImprovement: 3000}],
  ['TTFB', {good: 800, needsImprovement: 1800}],
]);

function rateMetric(
  metricName: string,
  value: number,
): MetricRating | undefined {
  const thresholds = FIELD_METRIC_THRESHOLDS.get(metricName);
  if (!thresholds) {
    return;
  }
  if (value <= thresholds.good) {
    return 'good';
  }
  if (value <= thresholds.needsImprovement) {
    return 'needs improvement';
  }
  return 'poor';
}

export function addFieldMetricRatings(summaryText: string): string {
  const lines = summaryText.split('\n');
  let inFieldMetrics = false;

  return lines
    .map(line => {
      if (line.startsWith('Metrics (field / real users):')) {
        inFieldMetrics = true;
        return line;
      }
      if (inFieldMetrics && line.startsWith('Available insights:')) {
        inFieldMetrics = false;
        return line;
      }
      if (!inFieldMetrics) {
        return line;
      }

      const match = line.match(
        /^(\s*-\s+)(LCP|INP|CLS|FCP|TTFB): ([\d.]+)(\s*ms)?(.*)$/,
      );
      if (!match) {
        return line;
      }

      const [, prefix, metricName, rawValue, unit = '', suffix] = match;
      const rating = rateMetric(metricName, Number(rawValue));
      if (!rating || suffix.includes('rating:')) {
        return line;
      }
      return `${prefix}${metricName}: ${rawValue}${unit} (${rating})${suffix}`;
    })
    .join('\n');
}

export type InsightName =
  keyof DevTools.TraceEngine.Insights.Types.InsightModels;
export type InsightOutput = {output: string} | {error: string};

export function getInsightOutput(
  result: TraceResult,
  insightSetId: string,
  insightName: InsightName,
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
  );
  return {output: formatter.formatInsight()};
}
