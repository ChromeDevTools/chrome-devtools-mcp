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

type Rating = 'good' | 'needs-improvement' | 'poor';

/**
 * Rate a Web Vitals metric value against its thresholds.
 * Thresholds are from https://web.dev/articles/vitals
 */
function rateMetric(metric: string, value: number): Rating | null {
  const thresholds: Record<string, {good: number; poor: number}> = {
    LCP: {good: 2500, poor: 4000},
    FCP: {good: 1800, poor: 3000},
    INP: {good: 200, poor: 500},
    TTFB: {good: 800, poor: 1800},
  };

  const t = thresholds[metric];
  if (!t) {
    return null;
  }
  if (value <= t.good) {
    return 'good';
  }
  if (value >= t.poor) {
    return 'poor';
  }
  return 'needs-improvement';
}

function rateCLS(value: number): Rating {
  if (value <= 0.1) {
    return 'good';
  }
  if (value >= 0.25) {
    return 'poor';
  }
  return 'needs-improvement';
}

/**
 * Post-process the formatter output to append a rating to each CrUX field
 * metric line. Lines produced by the DevTools formatter look like:
 *   - LCP: 2595 ms (scope: url)
 *   - INP: 140 ms (scope: url)
 *   - CLS: 0.06 (scope: url)
 *   - TTFB: 1273 ms (scope: url)
 *   - FCP: 2425 ms (scope: url)
 */
export function addRatingsToCruxMetrics(summary: string): string {
  const timingMetricRe =
    /^(\s+- (?:LCP|INP|FCP|TTFB): )(\d+) ms( \(scope: \w+\))$/;
  const clsMetricRe = /^(\s+- CLS: )(\d+\.\d+)( \(scope: \w+\))$/;

  return summary
    .split('\n')
    .map(line => {
      const timingMatch = line.match(timingMetricRe);
      if (timingMatch) {
        const metric = timingMatch[1]
          .trim()
          .replace(/^- /, '')
          .replace(/:.*/, '');
        const value = Number(timingMatch[2]);
        const rating = rateMetric(metric, value);
        if (rating) {
          return `${timingMatch[1]}${timingMatch[2]} ms${timingMatch[3]} [${rating}]`;
        }
      }
      const clsMatch = line.match(clsMetricRe);
      if (clsMatch) {
        const value = Number(clsMatch[2]);
        const rating = rateCLS(value);
        return `${clsMatch[1]}${clsMatch[2]}${clsMatch[3]} [${rating}]`;
      }
      return line;
    })
    .join('\n');
}

export function getTraceSummary(result: TraceResult): string {
  const focus = DevTools.AgentFocus.fromParsedTrace(result.parsedTrace);
  const formatter = new DevTools.PerformanceTraceFormatter(focus);
  const summaryText = addRatingsToCruxMetrics(formatter.formatTraceSummary());
  return `## Summary of Performance trace findings:
${summaryText}

## Details on call tree & network request formats:
${extraFormatDescriptions}`;
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
