/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools} from '../third_party/index.js';
import {logger} from '../utils/logger.js';

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

// Finds the start of the traceEvents array without converting the whole
// buffer into a string. Chrome traces can be either a plain array or an
// object containing a "traceEvents" array.
function findEventsArrayStart(buffer: Uint8Array): number {
  const isWhitespace = (b: number) =>
    b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;

  let i = 0;
  while (i < buffer.length && isWhitespace(buffer[i])) {
    i++;
  }

  if (i >= buffer.length) {
    return -1;
  }

  if (buffer[i] === 0x5b) {
    // The trace itself is the array.
    return i;
  }

  if (buffer[i] !== 0x7b) {
    return -1;
  }

  // Look for the traceEvents field in the root object.
  const key = '"traceEvents"';
  const keyBytes = new Uint8Array(key.length);
  for (let k = 0; k < key.length; k++) {
    keyBytes[k] = key.charCodeAt(k);
  }

  let keyIndex = -1;
  for (let j = i; j <= buffer.length - keyBytes.length; j++) {
    let matched = true;
    for (let k = 0; k < keyBytes.length; k++) {
      if (buffer[j + k] !== keyBytes[k]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      keyIndex = j;
      break;
    }
  }

  if (keyIndex === -1) {
    return -1;
  }

  // Move past the key and find the array after the ':'.
  let p = keyIndex + keyBytes.length;
  while (p < buffer.length && isWhitespace(buffer[p])) {
    p++;
  }
  if (p >= buffer.length || buffer[p] !== 0x3a) {
    // ':'
    return -1;
  }
  p++;
  while (p < buffer.length && isWhitespace(buffer[p])) {
    p++;
  }
  if (p >= buffer.length || buffer[p] !== 0x5b) {
    // '['
    return -1;
  }
  return p;
}

// Pulls the individual event objects out of the raw buffer without first
// turning the entire trace into a string. This keeps large trace files from
// hitting V8's maximum string size.
function extractTraceEvents(
  buffer: Uint8Array,
): DevTools.TraceEngine.Types.Events.Event[] {
  const events: DevTools.TraceEngine.Types.Events.Event[] = [];
  const decoder = new TextDecoder();

  const start = findEventsArrayStart(buffer);
  if (start === -1) {
    return events;
  }

  let inString = false;
  let escape = false;
  let depth = 0;
  let eventStart = -1;
  let arrayDepth = 0;

  for (let i = start; i < buffer.length; i++) {
    const b = buffer[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (b === 0x22) {
      // '"'
      inString = !inString;
      continue;
    }

    if (b === 0x5c && inString) {
      // '\'
      escape = true;
      continue;
    }

    if (!inString) {
      if (b === 0x5b) {
        // '['
        arrayDepth++;
      } else if (b === 0x5d) {
        // ']'
        arrayDepth--;

        // We've reached the end of the traceEvents array.
        if (arrayDepth === 0) {
          break;
        }
      } else if (b === 0x7b) {
        // '{'
        if (depth === 0) {
          eventStart = i;
        }
        depth++;
      } else if (b === 0x7d) {
        // '}'
        depth--;

        // A top-level object inside the array is one trace event.
        if (depth === 0 && eventStart !== -1) {
          if (arrayDepth > 0) {
            const chunk = buffer.subarray(eventStart, i + 1);
            events.push(JSON.parse(decoder.decode(chunk)));
          }
          eventStart = -1;
        }
      }
    }
  }

  return events;
}

// Parses the raw trace data and passes the extracted events to TraceEngine.
// The buffer is processed in smaller pieces instead of being decoded all at
// once, which avoids the string-size limit for very large trace files.
// A new model is used for each call so traces from different sessions don't
// get retained by the same model.
export async function parseRawTraceBuffer(
  buffer: Uint8Array<ArrayBufferLike> | undefined,
  metadata?: {
    cpuThrottling?: number;
    networkThrottling?: string;
  },
): Promise<TraceResult | TraceParseError> {
  if (!buffer) {
    return {
      error: 'No buffer was provided.',
    };
  }

  try {
    // Extract the events directly from the buffer.
    const events = extractTraceEvents(buffer);

    if (events.length === 0) {
      return {
        error:
          'No trace events could be parsed from the buffer. Expected either a top-level ' +
          'JSON array of events or an object with a "traceEvents" array.',
      };
    }

    // Use a new model for every trace so previous sessions don't stay in memory.
    const engine =
      DevTools.TraceEngine.TraceModel.Model.createWithAllHandlers();

    await engine.parse(events, {metadata});

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
