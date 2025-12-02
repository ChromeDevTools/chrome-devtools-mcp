/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';

import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';
import type {InsightName} from '../trace-processing/parse.js';
import {
  getInsightOutput,
  getTraceSummary,
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../trace-processing/parse.js';

import {ToolCategory} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {defineTool} from './ToolDefinition.js';

export const startTrace = defineTool({
  name: 'performance_start_trace',
  description:
    'Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    reload: zod
      .boolean()
      .describe(
        'Determines if, once tracing has started, the page should be automatically reloaded.',
      ),
    autoStop: zod
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
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    if (!context.isRunningPerformanceTrace()) {
      return;
    }
    const page = context.getSelectedPage();
    await stopTracingAndAppendOutput(page, response, context);
  },
});

export const analyzeInsight = defineTool({
  name: 'performance_analyze_insight',
  description:
    'Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    insightSetId: zod
      .string()
      .describe(
        'The id for the specific insight set. Only use the ids given in the "Available insight sets" list.',
      ),
    insightName: zod
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
      request.params.insightSetId,
      request.params.insightName as InsightName,
    );
    if ('error' in insightOutput) {
      response.appendResponseLine(insightOutput.error);
      return;
    }

    response.appendResponseLine(insightOutput.output);
  },
});

export const analyzeFile = defineTool({
  name: 'performance_analyze_file',
  description:
    'Analyzes a performance trace file from the local filesystem. This can be used to analyze traces exported from Chrome DevTools, Lighthouse, or other tools that generate Chrome trace format files.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    filePath: zod
      .string()
      .describe(
        'The absolute path to the trace file to analyze. Supports JSON trace files in Chrome trace format (e.g., trace.json, lighthouse-0.trace.json).',
      ),
  },
  handler: async (request, response, context) => {
    const {filePath} = request.params;

    try {
      const buffer = await fs.readFile(filePath);
      const result = await parseRawTraceBuffer(new Uint8Array(buffer));

      if (traceResultIsSuccess(result)) {
        context.storeTraceRecording(result);
        const traceSummaryText = getTraceSummary(result);
        response.appendResponseLine(
          `Successfully analyzed trace file: ${filePath}`,
        );
        response.appendResponseLine(traceSummaryText);
      } else {
        response.appendResponseLine(
          'There was an error parsing the trace file:',
        );
        response.appendResponseLine(result.error);
      }
    } catch (e) {
      const errorText = e instanceof Error ? e.message : JSON.stringify(e);
      logger(`Error reading trace file: ${errorText}`);
      response.appendResponseLine('An error occurred reading the trace file:');
      response.appendResponseLine(errorText);
    }
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
      const traceSummaryText = getTraceSummary(result);
      response.appendResponseLine(traceSummaryText);
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
