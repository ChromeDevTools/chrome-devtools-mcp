/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import zlib from 'node:zlib';

import {zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';
import type {InsightName} from '../trace-processing/parse.js';
import {
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../trace-processing/parse.js';

import {ToolCategory} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {defineTool} from './ToolDefinition.js';

const filePathSchema = zod
  .string()
  .optional()
  .describe(
    'The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).',
  );

export const startTrace = defineTool({
  name: 'performance_start_trace',
  description: `Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.`,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
  },
  schema: {
    reload: zod
      .boolean()
      .describe(
        'Determines if, once tracing has started, the current selected page should be automatically reloaded. Navigate the page to the right URL using the navigate_page tool BEFORE starting the trace if reload or autoStop is set to true.',
      ),
    autoStop: zod
      .boolean()
      .describe(
        'Determines if the trace recording should be automatically stopped.',
      ),
    filePath: filePathSchema,
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
      await stopTracingAndAppendOutput(
        page,
        response,
        context,
        request.params.filePath,
      );
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
    readOnlyHint: false,
  },
  schema: {
    filePath: filePathSchema,
  },
  handler: async (request, response, context) => {
    if (!context.isRunningPerformanceTrace()) {
      return;
    }
    const page = context.getSelectedPage();
    await stopTracingAndAppendOutput(
      page,
      response,
      context,
      request.params.filePath,
    );
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

    response.attachTraceInsight(
      lastRecording,
      request.params.insightSetId,
      request.params.insightName as InsightName,
    );
  },
});

async function stopTracingAndAppendOutput(
  page: Page,
  response: Response,
  context: Context,
  filePath?: string,
): Promise<void> {
  try {
    const traceEventsBuffer = await page.tracing.stop();
    if (filePath && traceEventsBuffer) {
      let dataToWrite: Uint8Array = traceEventsBuffer;
      if (filePath.endsWith('.gz')) {
        dataToWrite = await new Promise((resolve, reject) => {
          zlib.gzip(traceEventsBuffer, (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
        });
      }
      const file = await context.saveFile(dataToWrite, filePath);
      response.appendResponseLine(
        `The raw trace data was saved to ${file.filename}.`,
      );
    }
    const result = await parseRawTraceBuffer(traceEventsBuffer);
    response.appendResponseLine('The performance trace has been stopped.');
    if (traceResultIsSuccess(result)) {
      context.storeTraceRecording(result);
      response.attachTraceSummary(result);
    } else {
      throw new Error(
        `There was an unexpected error parsing the trace: ${result.error}`,
      );
    }
  } finally {
    context.setIsRunningPerformanceTrace(false);
  }
}
