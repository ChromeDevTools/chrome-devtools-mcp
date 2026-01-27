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
  const summaryText = formatter.formatTraceSummary();
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

export interface LCPPhase {
  name: string;
  durationMs: number;
}

export interface LCPBreakdownData {
  lcpMs: number;
  backendNodeId?: number;
  phases: LCPPhase[];
}

export function getLCPBreakdownData(
  result: TraceResult,
  insightSetId: string,
): LCPBreakdownData | null {
  if (!result.insights) {
    return null;
  }

  const insightSet = result.insights.get(insightSetId);
  if (!insightSet) {
    return null;
  }

  const lcpInsight = insightSet.model.LCPBreakdown;
  if (!lcpInsight) {
    return null;
  }

  // Extract backendNodeId from the LCP event if available
  const lcpEvent = lcpInsight.lcpEvent;
  const backendNodeId = lcpEvent?.args?.data?.nodeId;

  // Extract phases from subparts
  const phases: LCPPhase[] = [];
  if (lcpInsight.subparts) {
    const s = lcpInsight.subparts;
    const toMs = (micro: number) => micro / 1000;

    if (s.ttfb) {
      phases.push({name: 'TTFB', durationMs: toMs(s.ttfb.range)});
    }
    if (s.loadDelay) {
      phases.push({name: 'Load Delay', durationMs: toMs(s.loadDelay.range)});
    }
    if (s.loadDuration) {
      phases.push({name: 'Load Duration', durationMs: toMs(s.loadDuration.range)});
    }
    if (s.renderDelay) {
      phases.push({name: 'Render Delay', durationMs: toMs(s.renderDelay.range)});
    }
  }

  return {
    lcpMs: lcpInsight.lcpMs ?? 0,
    backendNodeId,
    phases,
  };
}

export interface LayoutShiftImages {
  before?: string;
  after?: string;
}

export interface LayoutShiftData {
  ts: number;
  score: number;
  images: LayoutShiftImages;
}

export function getLayoutShifts(
  result: TraceResult,
): LayoutShiftData[] {
  const layoutShifts: LayoutShiftData[] = [];
  
  // The LayoutShifts handler provides clusters and synthetic layout shift events.
  const clusters = result.parsedTrace.data.LayoutShifts.clusters;
  
  for (const cluster of clusters) {
    for (const event of cluster.events) {
      const images: LayoutShiftImages = {};
      
      if (event.parsedData.screenshots.before) {
        const beforeArgs = event.parsedData.screenshots.before.args;
        images.before = 'snapshot' in beforeArgs ? beforeArgs.snapshot : beforeArgs.dataUri;
      }
      if (event.parsedData.screenshots.after) {
        const afterArgs = event.parsedData.screenshots.after.args;
        images.after = 'snapshot' in afterArgs ? afterArgs.snapshot : afterArgs.dataUri;
      }

      layoutShifts.push({
        ts: event.ts,
        score: event.args.data?.weighted_score_delta ?? 0,
        images,
      });
    }
  }

  return layoutShifts;
}

export function getLayoutShiftImages(
  result: TraceResult,
  timestamp: number,
): LayoutShiftImages | null {
  const shifts = getLayoutShifts(result);
  const match = shifts.find(s => s.ts === timestamp);
  return match ? match.images : null;
}
