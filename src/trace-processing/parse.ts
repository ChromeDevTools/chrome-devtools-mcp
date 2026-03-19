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
 * Rate a timing-based Web Vitals metric value (in ms) against its thresholds.
 * Thresholds are from https://web.dev/articles/vitals
 */
export function rateTimingMetric(
  metric: string,
  valueMs: number,
): Rating | null {
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
  if (valueMs <= t.good) {
    return 'good';
  }
  if (valueMs >= t.poor) {
    return 'poor';
  }
  return 'needs-improvement';
}

export function rateCLS(value: number): Rating {
  if (value <= 0.1) {
    return 'good';
  }
  if (value >= 0.25) {
    return 'poor';
  }
  return 'needs-improvement';
}

/**
 * Build a CrUX field metrics section with ratings included directly,
 * using the structured data from the trace insights rather than
 * regex post-processing.
 */
function buildRatedCruxSection(result: TraceResult): string[] | null {
  const parsedTrace = result.parsedTrace;
  const insights = result.insights;
  if (!insights) {
    return null;
  }

  // Find the first insight set with CrUX data.
  for (const insightSet of insights.values()) {
    try {
      const cruxScope =
        DevTools.CrUXManager.instance().getSelectedScope();
      const fieldMetrics =
        DevTools.TraceEngine.Insights.Common.getFieldMetricsForInsightSet(
          insightSet,
          parsedTrace.metadata,
          cruxScope,
        );

      if (!fieldMetrics) {
        continue;
      }

      const {lcp: fieldLcp, inp: fieldInp, cls: fieldCls} = fieldMetrics;
      if (!fieldLcp && !fieldInp && !fieldCls) {
        continue;
      }

      const parts: string[] = [];
      parts.push('Metrics (field / real users):');

      if (fieldLcp) {
        const ms = Math.round(fieldLcp.value / 1000);
        const rating = rateTimingMetric('LCP', ms);
        const ratingStr = rating ? ` [${rating}]` : '';
        parts.push(
          `  - LCP: ${ms} ms (scope: ${fieldLcp.pageScope})${ratingStr}`,
        );
      }
      if (fieldInp) {
        const ms = Math.round(fieldInp.value / 1000);
        const rating = rateTimingMetric('INP', ms);
        const ratingStr = rating ? ` [${rating}]` : '';
        parts.push(
          `  - INP: ${ms} ms (scope: ${fieldInp.pageScope})${ratingStr}`,
        );
      }
      if (fieldCls) {
        const clsValue = fieldCls.value;
        const rating = rateCLS(clsValue);
        parts.push(
          `  - CLS: ${clsValue.toFixed(2)} (scope: ${fieldCls.pageScope}) [${rating}]`,
        );
      }

      return parts;
    } catch {
      continue;
    }
  }

  return null;
}

export function getTraceSummary(result: TraceResult): string {
  const focus = DevTools.AgentFocus.fromParsedTrace(result.parsedTrace);
  const formatter = new DevTools.PerformanceTraceFormatter(focus);
  let summaryText = formatter.formatTraceSummary();

  // Replace the CrUX section in the formatter output with our rated version.
  const ratedCrux = buildRatedCruxSection(result);
  if (ratedCrux) {
    const lines = summaryText.split('\n');
    const cruxHeaderIdx = lines.findIndex(l =>
      l.startsWith('Metrics (field / real users):'),
    );
    if (cruxHeaderIdx !== -1) {
      // Find the end of the CrUX section (next non-indented line or section header).
      let endIdx = cruxHeaderIdx + 1;
      while (
        endIdx < lines.length &&
        (lines[endIdx].startsWith('  - ') || lines[endIdx].startsWith('    - '))
      ) {
        endIdx++;
      }
      lines.splice(
        cruxHeaderIdx,
        endIdx - cruxHeaderIdx,
        ...ratedCrux,
      );
      summaryText = lines.join('\n');
    }
  }
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
