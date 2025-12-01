/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from 'puppeteer-core';
import z from 'zod';

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

/**
 * Consolidated performance tracing tool.
 * Combines: performance_start_trace, performance_stop_trace, performance_analyze_insight
 */
export const performance = defineTool({
  name: 'performance',
  description: 'Performance trace: start, stop, or analyze insight.',
  annotations: {
    category: ToolCategories.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    op: z.enum(['start', 'stop', 'analyze']).describe('Operation'),
    reload: z.boolean().optional().describe('Reload page on start'),
    autoStop: z.boolean().optional().describe('Auto-stop after 5s'),
    insightName: z.string().optional().describe('Insight name (for analyze)'),
  },
  handler: async (request, response, context) => {
    const {op, reload, autoStop, insightName} = request.params;

    switch (op) {
      case 'start': {
        if (context.isRunningPerformanceTrace()) {
          response.appendResponseLine(
            'Error: trace already running. Use stop first.',
          );
          return;
        }
        context.setIsRunningPerformanceTrace(true);

        const page = context.getSelectedPage();
        const pageUrlForTracing = page.url();

        if (reload) {
          await page.goto('about:blank', {waitUntil: ['networkidle0']});
        }

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
        await page.tracing.start({categories});

        if (reload) {
          await page.goto(pageUrlForTracing, {waitUntil: ['load']});
        }

        if (autoStop) {
          await new Promise(resolve => setTimeout(resolve, 5_000));
          await stopTracingAndAppendOutput(page, response, context);
        } else {
          response.appendResponseLine('Trace started. Use stop to finish.');
        }
        break;
      }

      case 'stop': {
        if (!context.isRunningPerformanceTrace()) {
          response.appendResponseLine('No trace running.');
          return;
        }
        const page = context.getSelectedPage();
        await stopTracingAndAppendOutput(page, response, context);
        break;
      }

      case 'analyze': {
        if (!insightName) {
          throw new Error('insightName required for analyze');
        }
        const lastRecording = context.recordedTraces().at(-1);
        if (!lastRecording) {
          response.appendResponseLine('No recorded traces. Run a trace first.');
          return;
        }

        const insightOutput = getInsightOutput(
          lastRecording,
          insightName as InsightName,
        );
        if ('error' in insightOutput) {
          response.appendResponseLine(insightOutput.error);
          return;
        }
        response.appendResponseLine(insightOutput.output);
        break;
      }
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
    response.appendResponseLine('Trace stopped.');
    if (traceResultIsSuccess(result)) {
      context.storeTraceRecording(result);
      response.appendResponseLine('Summary:');
      const traceSummaryText = getTraceSummary(result);
      response.appendResponseLine(traceSummaryText);
    } else {
      response.appendResponseLine('Parse error:');
      response.appendResponseLine(result.error);
    }
  } catch (e) {
    const errorText = e instanceof Error ? e.message : JSON.stringify(e);
    logger(`Error stopping trace: ${errorText}`);
    response.appendResponseLine('Error:');
    response.appendResponseLine(errorText);
  } finally {
    context.setIsRunningPerformanceTrace(false);
  }
}
