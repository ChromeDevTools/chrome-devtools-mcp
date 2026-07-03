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
  metadata?: {
    cpuThrottling?: number;
    networkThrottling?: string;
  },
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
    await engine.parse(events, {metadata});
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
    logger?.(`Unexpected error parsing trace: ${errorText}`);
    return {
      error: errorText,
    };
  }
}

const extraFormatDescriptions = `Information on performance traces may contain main thread activity represented as call frames and network requests.

${DevTools.PerformanceTraceFormatter.callFrameDataFormatDescription}

${DevTools.PerformanceTraceFormatter.networkDataFormatDescription}`;

type CruxFieldMetricRating = 'good' | 'needs improvement' | 'poor';

const CRUX_FIELD_METRIC_LINE =
  /^ {2}- (?<metric>LCP|INP|CLS): (?<value>[0-9.]+)(?<unit> ms)? \(scope: (?<scope>url|origin)\)$/;

function getCruxFieldMetricRating(
  metric: string,
  value: number,
): CruxFieldMetricRating | null {
  switch (metric) {
    case 'LCP':
      if (value <= 2500) {
        return 'good';
      }
      if (value <= 4000) {
        return 'needs improvement';
      }
      return 'poor';
    case 'INP':
      if (value <= 200) {
        return 'good';
      }
      if (value <= 500) {
        return 'needs improvement';
      }
      return 'poor';
    case 'CLS':
      if (value <= 0.1) {
        return 'good';
      }
      if (value <= 0.25) {
        return 'needs improvement';
      }
      return 'poor';
    default:
      return null;
  }
}

function formatCruxFieldMetricLine(line: string): string {
  const match = CRUX_FIELD_METRIC_LINE.exec(line);
  const metric = match?.groups?.metric;
  const valueText = match?.groups?.value;
  const unit = match?.groups?.unit ?? '';
  const scope = match?.groups?.scope;

  if (!metric || !valueText || !scope) {
    return line;
  }

  if (metric === 'CLS' ? unit !== '' : unit !== ' ms') {
    return line;
  }

  const value = Number(valueText);
  if (!Number.isFinite(value)) {
    return line;
  }

  const rating = getCruxFieldMetricRating(metric, value);
  if (!rating) {
    return line;
  }

  return `  - ${metric}: ${valueText}${unit} (rating: ${rating}, scope: ${scope})`;
}

function formatCruxFieldMetricRatings(summaryText: string): string {
  let inFieldMetrics = false;
  const lines = summaryText.split('\n');

  return lines
    .map(line => {
      if (line === 'Metrics (field / real users):') {
        inFieldMetrics = true;
        return line;
      }

      if (inFieldMetrics && !line.startsWith('  ')) {
        inFieldMetrics = false;
      }

      if (!inFieldMetrics) {
        return line;
      }

      return formatCruxFieldMetricLine(line);
    })
    .join('\n');
}

export function getTraceSummary(
  result: TraceResult,
  deviceScope?: DevTools.CrUXManager.DeviceScope | null,
): string {
  const focus = DevTools.AgentFocus.fromParsedTrace(result.parsedTrace);
  const formatter = new DevTools.PerformanceTraceFormatter(focus, deviceScope);
  const summaryText = formatCruxFieldMetricRatings(
    formatter.formatTraceSummary(),
  );
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
