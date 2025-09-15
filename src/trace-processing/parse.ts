/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {PerformanceTraceFormatter} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/PerformanceTraceFormatter.js';
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

// TODO(jactkfranklin): move the formatters from DevTools to use here.
// This is a very temporary helper to output some text from the tool call to aid development.
export function insightOutput(result: TraceResult): string {
  const focus = AgentFocus.full(result.parsedTrace);
  const serializer = new TraceEngine.EventsSerializer.EventsSerializer();
  const formatter = new PerformanceTraceFormatter(focus, serializer);
  const output = formatter.formatTraceSummary();
  return output;
}
