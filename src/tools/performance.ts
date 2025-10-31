/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
    'Provides more detailed information on a specific Performance Insight that was highlighted in the results of a trace recording.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
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

// This key is expected to be visible. b/349721878
const CRUX_API_KEY = 'AIzaSyBn5gimNjhiEyA_euicSKko6IlD3HdgUfk';
const CRUX_ENDPOINT = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${CRUX_API_KEY}`;

export const queryChromeUXReport = defineTool({
  name: 'performance_query_chrome_ux_report',
  description:
    'Queries the Chrome UX Report (aka CrUX) to get aggregated real-user experience metrics (like Core Web Vitals) for a given URL or origin.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    origin: zod
      .string()
      .describe(
        'The origin to query, e.g., "https://web.dev". Do not provide this if "url" is specified.',
      )
      .optional(),
    url: zod
      .string()
      .describe(
        'The specific page URL to query, e.g., "https://web.dev/s/results?q=puppies". Do not provide this if "origin" is specified.',
      )
      .optional(),
    formFactor: zod
      .enum(['DESKTOP', 'PHONE', 'TABLET'])
      .describe(
        'The form factor to filter by. If omitted, data for all form factors is aggregated.',
      )
      .optional(),
  },
  handler: async (request, response) => {
    const {origin: origin_, url, formFactor} = request.params;
    // Ensure probably formatted origin (no trailing slash);
    const origin = URL.parse(origin_ ?? '')?.origin;

    if ((!origin && !url) || (origin && url)) {
      return response.appendResponseLine(
        'Error: you must provide either "origin" or "url", but not both.',
      );
    }

    try {
      const cruxResponse = await fetch(CRUX_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          referer: 'devtools://mcp',
        },
        body: JSON.stringify({
          origin,
          url,
          formFactor,
        }),
      });

      const data = await cruxResponse.json();
      response.appendResponseLine(JSON.stringify(data, null, 2));
    } catch (e) {
      const errorText = e instanceof Error ? e.message : JSON.stringify(e);
      logger(`Error fetching CrUX data: ${errorText}`);
      response.appendResponseLine('An error occurred fetching CrUX data:');
      response.appendResponseLine(errorText);
    }
  },
});
