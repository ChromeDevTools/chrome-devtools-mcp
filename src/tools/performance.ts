/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';
import {Context, defineTool, Response} from './ToolDefinition.js';
import {insightOutput, parseRawTraceBuffer} from '../trace-processing/parse.js';
import {logger} from '../logger.js';
import {Page} from 'puppeteer-core';
import {ToolCategories} from './categories.js';

export const startTrace = defineTool({
  name: 'performance_start_trace',
  description: 'Starts a performance trace recording',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    reload: z
      .boolean()
      .describe(
        'Determines if, once tracing has started, the page should be automatically reloaded',
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

    // This panel may be opened with trace data recorded in other tools.
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
  description: 'Stops the active performance trace recording',
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

async function stopTracingAndAppendOutput(
  page: Page,
  response: Response,
  context: Context,
): Promise<void> {
  try {
    const traceEventsBuffer = await page.tracing.stop();
    const result = await parseRawTraceBuffer(traceEventsBuffer);
    response.appendResponseLine('The performance trace has been stopped.');
    if (result) {
      const insightText = insightOutput(result);
      if (insightText) {
        response.appendResponseLine('Insights with performance opportunities:');
        response.appendResponseLine(insightText);
      } else {
        response.appendResponseLine(
          'No insights has been found. The performance looks good!',
        );
      }
    }
  } catch (e) {
    logger(
      `Error stopping performance trace: ${e instanceof Error ? e.message : JSON.stringify(e)}`,
    );
  } finally {
    context.setIsRunningPerformanceTrace(false);
  }
}
