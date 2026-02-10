/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import {startTrace as cdpStartTrace, stopTrace as cdpStopTrace, getTraceData} from '../cdp-events.js';
import {logger} from '../logger.js';
import {zod, DevTools} from '../third_party/index.js';
import type {InsightName, TraceResult} from '../trace-processing/parse.js';
import {
  getInsightOutput,
  getTraceSummary,
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../trace-processing/parse.js';
import {sendCdp} from '../vscode.js';

import {ToolCategory} from './categories.js';
import type {Response} from './ToolDefinition.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

// Module-level state for tracking trace status
let isRunningTrace = false;
const recordedTraces: TraceResult[] = [];

const filePathSchema = zod
  .string()
  .optional()
  .describe(
    'The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).',
  );

const StartTraceOutputSchema = zod.object({
  status: zod.enum(['recording', 'completed']),
  message: zod.string(),
  filePath: zod.string().optional(),
});

export const startTrace = defineTool({
  name: 'performance_start_trace',
  description: `Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.

Args:
  - reload (boolean): Reload page after starting trace. Navigate to desired URL BEFORE calling
  - autoStop (boolean): Auto-stop trace after 5 seconds
  - filePath (string): Save raw trace to file (e.g., trace.json.gz)
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { status: 'recording'|'completed', message, filePath? }
  Markdown format: Recording status or trace analysis summary

Examples:
  - "Record page load" -> { reload: true, autoStop: true }
  - "Start manual recording" -> { reload: false, autoStop: false }
  - "Save trace" -> { reload: true, autoStop: true, filePath: "trace.json.gz" }

Error Handling:
  - Returns error if trace is already running
  - Only one trace can run at a time`,
  timeoutMs: 120000,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
    reload: zod
      .boolean()
      .describe(
        'Determines if, once tracing has started, the current selected page should be automatically reloaded. Ensure the page is at the correct URL BEFORE starting the trace if reload or autoStop is set to true.',
      ),
    autoStop: zod
      .boolean()
      .describe(
        'Determines if the trace recording should be automatically stopped.',
      ),
    filePath: filePathSchema,
  },
  outputSchema: StartTraceOutputSchema,
  handler: async (request, response) => {
    if (isRunningTrace) {
      if (request.params.response_format === ResponseFormat.JSON) {
        response.appendResponseLine(JSON.stringify({
          status: 'recording',
          message: 'A performance trace is already running. Use performance_stop_trace to stop it.',
        }, null, 2));
        return;
      }
      response.appendResponseLine(
        'Error: a performance trace is already running. Use performance_stop_trace to stop it. Only one trace can be running at any given time.',
      );
      return;
    }
    isRunningTrace = true;

    try {
      // Get current URL if we need to reload
      let pageUrl: string | undefined;
      if (request.params.reload) {
        try {
          const result = await sendCdp('Runtime.evaluate', {
            expression: 'window.location.href',
            returnByValue: true,
          });
          pageUrl = result.result.value;

          // Navigate to about:blank first to clear state
          await sendCdp('Page.navigate', {url: 'about:blank'});
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          logger('Error getting page URL:', err);
        }
      }

      // Start tracing with CDP
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

      await cdpStartTrace({categories});

      if (request.params.reload && pageUrl) {
        await sendCdp('Page.navigate', {url: pageUrl});
        // Wait for load
        await new Promise(r => setTimeout(r, 3000));
      }

      if (request.params.autoStop) {
        await new Promise(resolve => setTimeout(resolve, 5_000));
        await stopTracingAndAppendOutput(
          response,
          request.params.filePath,
        );
      } else {
        response.appendResponseLine(
          `The performance trace is being recorded. Use performance_stop_trace to stop it.`,
        );
      }
    } catch (err) {
      isRunningTrace = false;
      throw err;
    }
  },
});

const StopTraceOutputSchema = zod.object({
  status: zod.enum(['stopped', 'not_running']),
  message: zod.string(),
  filePath: zod.string().optional(),
});

export const stopTrace = defineTool({
  name: 'performance_stop_trace',
  description: `Stops the active performance trace recording on the selected page.

Args:
  - filePath (string): Save raw trace to file (e.g., trace.json.gz)
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { status: 'stopped'|'not_running', message, filePath? }
  Markdown format: Trace stopped confirmation + analysis summary

Examples:
  - "Stop and analyze" -> {}
  - "Stop and save" -> { filePath: "trace.json.gz" }

Error Handling:
  - Returns "No performance trace is currently running." if no trace active`,
  timeoutMs: 60000,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
    filePath: filePathSchema,
  },
  outputSchema: StopTraceOutputSchema,
  handler: async (request, response) => {
    if (!isRunningTrace) {
      if (request.params.response_format === ResponseFormat.JSON) {
        response.appendResponseLine(JSON.stringify({
          status: 'not_running',
          message: 'No performance trace is currently running.',
        }, null, 2));
        return;
      }
      response.appendResponseLine('No performance trace is currently running.');
      return;
    }
    await stopTracingAndAppendOutput(
      response,
      request.params.filePath,
    );
  },
});

const AnalyzeInsightOutputSchema = zod.object({
  insightSetId: zod.string(),
  insightName: zod.string(),
  found: zod.boolean(),
});

export const analyzeInsight = defineTool({
  name: 'performance_analyze_insight',
  description: `Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.

Args:
  - insightSetId (string): Insight set ID from "Available insight sets" list
  - insightName (string): Insight name (e.g., "DocumentLatency", "LCPBreakdown")
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  Detailed insight analysis with recommendations

Examples:
  - "Analyze LCP breakdown" -> { insightSetId: "main-frame", insightName: "LCPBreakdown" }
  - "Check document latency" -> { insightSetId: "main-frame", insightName: "DocumentLatency" }

Error Handling:
  - Returns "No recorded traces found." if no trace has been recorded`,
  timeoutMs: 30000,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
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
  outputSchema: AnalyzeInsightOutputSchema,
  handler: async (request, response) => {
    const lastRecording = recordedTraces.at(-1);
    if (!lastRecording) {
      response.appendResponseLine(
        'No recorded traces found. Record a performance trace so you have Insights to analyze.',
      );
      return;
    }

    const insight = getInsightOutput(
      lastRecording,
      request.params.insightSetId,
      request.params.insightName as InsightName,
    );
    if ('error' in insight) {
      response.appendResponseLine(insight.error);
    } else {
      response.appendResponseLine(insight.output);
    }
  },
});

async function stopTracingAndAppendOutput(
  response: Response,
  filePath?: string,
): Promise<void> {
  try {
    const traceEvents = await cdpStopTrace();

    // Convert trace events to JSON buffer
    const traceData = {traceEvents};
    const traceJson = JSON.stringify(traceData);
    const traceEventsBuffer = Buffer.from(traceJson, 'utf-8');

    if (filePath) {
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

      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);
      fs.writeFileSync(fullPath, dataToWrite);
      response.appendResponseLine(
        `The raw trace data was saved to ${fullPath}.`,
      );
    }

    const result = await parseRawTraceBuffer(traceEventsBuffer);
    response.appendResponseLine('The performance trace has been stopped.');

    if (traceResultIsSuccess(result)) {
      recordedTraces.push(result);
      response.appendResponseLine(getTraceSummary(result));
    } else {
      throw new Error(
        `There was an unexpected error parsing the trace: ${result.error}`,
      );
    }
  } finally {
    isRunningTrace = false;
  }
}
