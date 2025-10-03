/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from 'puppeteer-core';
import z from 'zod';

import {PerformanceTraceFormatter} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/PerformanceTraceFormatter.js';
import {AICallTree} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/performance/AICallTree.js';
import {AgentFocus} from '../../node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/performance/AIContext.js';
import * as TraceEngine from '../../node_modules/chrome-devtools-frontend/front_end/models/trace/trace.js';
import {logger} from '../logger.js';
import type {InsightName} from '../trace-processing/parse.js';
import {
  getInsightOutput,
  getTraceSummary,
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../trace-processing/parse.js';

import {ToolCategories} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {defineTool} from './ToolDefinition.js';

export const startTrace = defineTool({
  name: 'performance_start_trace',
  description:
    'Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    reload: z
      .boolean()
      .describe(
        'Determines if, once tracing has started, the page should be automatically reloaded.',
      ),
    autoStop: z
      .boolean()
      .describe(
        'Determines if the trace recording should be automatically stopped.',
      ),
  },
  handler: async (request, response, context) => {
    if (context.isRunningPerformanceTrace()) {
      response.appendResponseLine(
        'Error: a performance trace is already running. Use performance_stop_trace to stop it. Only one trace can be running at any given time.',
      );
      return;
    }
    context.setIsRunningPerformanceTrace(true);

    const page = context.getSelectedPage();
    const pageUrlForTracing = page.url();

    if (request.params.reload) {
      // Before starting the recording, navigate to about:blank to clear out any state.
      await page.goto('about:blank', {
        waitUntil: ['networkidle0'],
      });
    }

    // Keep in sync with the categories arrays in:
    // https://source.chromium.org/chromium/chromium/src/+/main:third_party/devtools-frontend/src/front_end/panels/timeline/TimelineController.ts
    // https://github.com/GoogleChrome/lighthouse/blob/master/lighthouse-core/gather/gatherers/trace.js
    const categories = [
      '-*',
      'blink.console',
      'blink.user_timing',
      'devtools.timeline',
      'disabled-by-default-devtools.screenshot',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.invalidationTracking',
      'disabled-by-default-devtools.timeline.frame',
      'disabled-by-default-devtools.timeline.stack',
      'disabled-by-default-v8.cpu_profiler',
      'disabled-by-default-v8.cpu_profiler.hires',
      'latencyInfo',
      'loading',
      'disabled-by-default-lighthouse',
      'v8.execute',
      'v8',
    ];
    await page.tracing.start({
      categories,
    });

    if (request.params.reload) {
      await page.goto(pageUrlForTracing, {
        waitUntil: ['load'],
      });
    }

    if (request.params.autoStop) {
      await new Promise(resolve => setTimeout(resolve, 5_000));
      await stopTracingAndAppendOutput(page, response, context);
    } else {
      response.appendResponseLine(
        `The performance trace is being recorded. Use performance_stop_trace to stop it.`,
      );
    }
  },
});

export const stopTrace = defineTool({
  name: 'performance_stop_trace',
  description:
    'Stops the active performance trace recording on the selected page.',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    if (!context.isRunningPerformanceTrace) {
      return;
    }
    const page = context.getSelectedPage();
    await stopTracingAndAppendOutput(page, response, context);
  },
});

export const analyzeInsight = defineTool({
  name: 'performance_analyze_insight',
  description:
    'Provides more detailed information on a specific Performance Insight that was highlighted in the results of a trace recording.',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    insightName: z
      .string()
      .describe(
        'The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"',
      ),
  },
  handler: async (request, response, context) => {
    const lastRecording = context.recordedTraces().at(-1);
    if (!lastRecording) {
      response.appendResponseLine(
        'No recorded traces found. Record a performance trace so you have Insights to analyze.',
      );
      return;
    }

    const insightOutput = getInsightOutput(
      lastRecording,
      request.params.insightName as InsightName,
    );
    if ('error' in insightOutput) {
      response.appendResponseLine(insightOutput.error);
      return;
    }

    response.appendResponseLine(insightOutput.output);
  },
});

async function stopTracingAndAppendOutput(
  page: Page,
  response: Response,
  context: Context,
): Promise<void> {
  try {
    const traceEventsBuffer = await page.tracing.stop();
    const result = await parseRawTraceBuffer(traceEventsBuffer);
    response.appendResponseLine('The performance trace has been stopped.');
    if (traceResultIsSuccess(result)) {
      context.storeTraceRecording(result);
      response.appendResponseLine(
        'Here is a high level summary of the trace and the Insights that were found:',
      );
      const traceSummaryText = getTraceSummary(result);
      response.appendResponseLine(traceSummaryText);

      response.appendResponseLine(ADDITIONAL_INSTRUCTIONS);
    } else {
      response.appendResponseLine(
        'There was an unexpected error parsing the trace:',
      );
      response.appendResponseLine(result.error);
    }
  } catch (e) {
    const errorText = e instanceof Error ? e.message : JSON.stringify(e);
    logger(`Error stopping performance trace: ${errorText}`);
    response.appendResponseLine(
      'An error occurred generating the response for this trace:',
    );
    response.appendResponseLine(errorText);
  } finally {
    context.setIsRunningPerformanceTrace(false);
  }
}

export const getEventByKey = defineTool({
  name: 'performance_get_event_by_key',
  description:
    'Returns detailed information about a specific event. Use the detail returned to validate performance issues, but do not tell the user about irrelevant raw data from a trace event.',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    eventKey: z
      .string()
      .describe(
        'The key for the event. This is NOT the name of the event, but the key that has been provided to you as `eventKey` in previous responses, such as `r-1234`.',
      ),
  },
  handler: async (request, response, context) => {
    const trace = context.recordedTraces().at(-1);
    if (!trace) {
      response.appendResponseLine('Error: no trace recorded');
      return;
    }
    const focus = AgentFocus.fromParsedTrace(trace.parsedTrace);
    const event = focus.lookupEvent(
      request.params.eventKey as TraceEngine.Types.File.SerializableKey,
    );
    if (!event) {
      response.appendResponseLine('Error: no event with key found');
      return;
    }
    response.appendResponseLine(`Event:\n${JSON.stringify(event, null, 2)}`);
  },
});

export const getMainThreadTrackSummary = defineTool({
  name: 'performance_get_main_thread_track_summary',
  description:
    'Returns a summary of the main thread for the given bounds. The result includes a top-down summary, bottom-up summary, third-parties summary, and a list of related insights for the events within the given bounds.',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    min: z.number().describe('The minimum time of the bounds, in microseconds'),
    max: z.number().describe('The maximum time of the bounds, in microseconds'),
  },
  handler: async (request, response, context) => {
    const trace = context.recordedTraces().at(-1);
    if (!trace) {
      response.appendResponseLine('Error: no trace recorded');
      return;
    }
    const bounds = createBounds(
      trace.parsedTrace,
      request.params.min as TraceEngine.Types.Timing.Micro,
      request.params.max as TraceEngine.Types.Timing.Micro,
    );
    if (!bounds) {
      response.appendResponseLine('Erorr: invalid trace bounds');
      return;
    }

    const focus = AgentFocus.fromParsedTrace(trace.parsedTrace);
    const formatter = new PerformanceTraceFormatter(focus);
    response.appendResponseLine(formatter.formatMainThreadTrackSummary(bounds));
  },
});

export const getNetworkTrackSummary = defineTool({
  name: 'performance_get_network_track_summary',
  description: 'Returns a summary of the network for the given bounds.',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    min: z.number().describe('The minimum time of the bounds, in microseconds'),
    max: z.number().describe('The maximum time of the bounds, in microseconds'),
  },
  handler: async (request, response, context) => {
    const trace = context.recordedTraces().at(-1);
    if (!trace) {
      response.appendResponseLine('Error: no trace recorded');
      return;
    }
    const bounds = createBounds(
      trace.parsedTrace,
      request.params.min as TraceEngine.Types.Timing.Micro,
      request.params.max as TraceEngine.Types.Timing.Micro,
    );
    if (!bounds) {
      response.appendResponseLine('Erorr: invalid trace bounds');
      return;
    }

    const focus = AgentFocus.fromParsedTrace(trace.parsedTrace);
    const formatter = new PerformanceTraceFormatter(focus);
    response.appendResponseLine(formatter.formatNetworkTrackSummary(bounds));
  },
});

export const getDetailedCallTree = defineTool({
  name: 'performance_get_detailed_call_tree',
  description: 'Returns a detailed call tree for the given main thread event.',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    eventKey: z.string().describe('The key for the event.'),
  },
  handler: async (request, response, context) => {
    const trace = context.recordedTraces().at(-1);
    if (!trace) {
      response.appendResponseLine('Error: no trace recorded');
      return;
    }
    const focus = AgentFocus.fromParsedTrace(trace.parsedTrace);
    const event = focus.lookupEvent(
      request.params.eventKey as TraceEngine.Types.File.SerializableKey,
    );
    if (!event) {
      response.appendResponseLine('Error: no event with key found');
      return;
    }
    const formatter = new PerformanceTraceFormatter(focus);
    const tree = AICallTree.fromEvent(event, trace.parsedTrace);
    const callTree = tree
      ? formatter.formatCallTree(tree)
      : 'No call tree found';
    response.appendResponseLine(callTree);
  },
});

const createBounds = (
  trace: TraceEngine.TraceModel.ParsedTrace,
  min: TraceEngine.Types.Timing.Micro,
  max: TraceEngine.Types.Timing.Micro,
): TraceEngine.Types.Timing.TraceWindowMicro | null => {
  if (min > max) {
    return null;
  }

  const clampedMin = Math.max(min ?? 0, trace.data.Meta.traceBounds.min);
  const clampedMax = Math.min(
    max ?? Number.POSITIVE_INFINITY,
    trace.data.Meta.traceBounds.max,
  );
  if (clampedMin > clampedMax) {
    return null;
  }

  return TraceEngine.Helpers.Timing.traceWindowFromMicroSeconds(
    clampedMin as TraceEngine.Types.Timing.Micro,
    clampedMax as TraceEngine.Types.Timing.Micro,
  );
};

const ADDITIONAL_INSTRUCTIONS = `You have been provided a summary of a trace: some performance metrics; the most critical network requests; a bottom-up call graph summary; and a brief overview of available insights. Each insight has information about potential performance issues with the page.

Don't mention anything about an insight without first getting more data about it by calling \`performance_analyze_insight\`.

You have many functions available to learn more about the trace. Use these to confirm hypotheses, or to further explore the trace when diagnosing performance issues.

You will be given bounds representing a time range within the trace. Bounds include a min and a max time in microseconds. max is always bigger than min in a bounds.

The 3 main performance metrics are:
- LCP: "Largest Contentful Paint"
- INP: "Interaction to Next Paint"
- CLS: "Cumulative Layout Shift"

Trace events referenced in the information given to you will be marked with an \`eventKey\`. For example: \`LCP element: <img src="..."> (eventKey: r-123, ts: 123456)\`
You can use this key with \`performance_get_event_by_key\` to get more information about that trace event. For example: \`performance_get_event_by_key('r-123')\`

## Step-by-step instructions for debugging performance issues

Note: if the user asks a specific question about the trace (such as "What is my LCP?", or "How many requests were render-blocking?", directly answer their question and skip starting a performance investigation. Otherwise, your task is to collaborate with the user to discover and resolve real performance issues.

### Step 1: Determine a performance problem to investigate

- With help from the user, determine what performance problem to focus on.
- If the user is not specific about what problem to investigate, help them by doing a high-level investigation yourself. Present to the user a few options with 1-sentence summaries. Mention what performance metrics each option impacts. Call as many functions and confirm the data thoroughly: never present an option without being certain it is a real performance issue. Don't suggest solutions yet.
- Rank the options from most impactful to least impactful, and present them to the user in that order.
- Don't present more than 5 options.
- Once a performance problem has been identified for investigation, move on to step 2.

### Step 2: Suggest solutions

- Suggest possible solutions to remedy the identified performance problem. Be as specific as possible, using data from the trace via the provided functions to back up everything you say. You should prefer specific solutions, but absent any specific solution you may suggest general solutions (such as from an insight's documentation links).
- A good first step to discover solutions is to consider the insights, but you should also validate all potential advice by analyzing the trace until you are confident about the root cause of a performance issue.

## Guidelines

- Use the provided functions to get detailed performance data. Prioritize functions that provide context relevant to the performance issue being investigated.
- Before finalizing your advice, look over it and validate using any relevant functions. If something seems off, refine the advice before giving it to the user.
- Do not rely on assumptions or incomplete information. Use the provided functions to get more data when needed.
- Use the track summary functions to get high-level detail about portions of the trace. For the \`bounds\` parameter, default to using the bounds of the trace. Never specifically ask the user for a bounds. You can use more narrow bounds (such as the bounds relevant to a specific insight) when appropriate. Narrow the bounds given functions when possible.
- Use \`performance_get_event_by_key\` to get data on a specific trace event. This is great for root-cause analysis or validating any assumptions.
- Provide clear, actionable recommendations. Avoid technical jargon unless necessary, and explain any technical terms used.
- If you see a generic task like "Task", "Evaluate script" or "(anonymous)" in the main thread activity, try to look at its children to see what actual functions are executed and refer to those. When referencing the main thread activity, be as specific as you can. Ensure you identify to the user relevant functions and which script they were defined in. Avoid referencing "Task", "Evaluate script" and "(anonymous)" nodes if possible and instead focus on their children.
- Structure your response using markdown headings and bullet points for improved readability.
- Be direct and to the point. Avoid unnecessary introductory phrases or filler content. Focus on delivering actionable advice efficiently.

## Strict Constraints

Adhere to the following critical requirements:

- Never show bounds to the user.
- Never show eventKey to the user.
- Ensure your responses only use ms for time units.
- Ensure numbers for time units are rounded to the nearest whole number.
- Ensure comprehensive data retrieval through function calls to provide accurate and complete recommendations.
- If the user asks a specific question about web performance that doesn't have anything to do with the trace, don't call any functions and be succinct in your answer.
- Before suggesting changing the format of an image, consider what format it is already in. For example, if the mime type is image/webp, do not suggest to the user that the image is converted to WebP, as the image is already in that format.
- Do not mention the functions you call to gather information about the trace (e.g., \`performance_get_event_by_key\`, \`performance_get_main_thread_track_summary\`) in your output. These are internal implementation details that should be hidden from the user.
- Do not mention that you are an AI, or refer to yourself in the third person. You are simulating a performance expert.
`;

