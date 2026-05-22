/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import zlib from 'node:zlib';

import {logger} from '../logger.js';
import {zod, DevTools} from '../third_party/index.js';

import type {InsightName, TraceResult} from '../trace-processing/parse.js';
// CrUX web vital thresholds (per web.dev)
const CRUX_THRESHOLDS: Record<string, {good: number; needsImprovement: number}> = {
  LCP: {good: 2500, needsImprovement: 4000},
  FID: {good: 100, needsImprovement: 300},
  CLS: {good: 0.1, needsImprovement: 0.25},
  INP: {good: 200, needsImprovement: 500},
  TTFB: {good: 800, needsImprovement: 1800},
};

function getCruxRating(metric: string, value: number): string {
  const thresholds = CRUX_THRESHOLDS[metric];
  if (!thresholds) return 'unknown';
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.needsImprovement) return 'needs improvement';
  return 'poor';
}

function formatCruxFieldData(data: Record<string, number | undefined>): string {
  if (!data || Object.keys(data).length === 0) return 'No CrUX field data available.';
  
  const lines: string[] = [];
  lines.push('--- CrUX Field Data (real-user metrics) ---');
  
  const metrics: Record<string, string> = {lcp: 'LCP', fid: 'FID', cls: 'CLS', inp: 'INP', ttfb: 'TTFB'};
  for (const [key, metric] of Object.entries(metrics)) {
    const value = data[key as keyof typeof data];
    if (value !== undefined) {
      const rating = getCruxRating(metric, value);
      lines.push(`  ${metric}: ${value} -- ${rating}`);
    }
  }
  
  return lines.join('\n');
}

import {
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../trace-processing/parse.js';

import {ToolCategory} from './categories.js';
import type {Context, Response, ContextPage} from './ToolDefinition.js';
import {definePageTool} from './ToolDefinition.js';

const filePathSchema = zod
  .string()
  .optional()
  .describe(
    'The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).',
  );

export const startTrace = definePageTool({
  name: 'performance_start_trace',
  description: `Start a performance trace on the selected webpage. Use to find frontend performance issues, Core Web Vitals (LCP, INP, CLS), and improve page load speed.`,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
  },
  schema: {
    reload: zod
      .boolean()
      .default(true)
      .describe(
        'Determines if, once tracing has started, the current selected page should be automatically reloaded. Navigate the page to the right URL using the navigate_page tool BEFORE starting the trace if reload or autoStop is set to true.',
      ),
    autoStop: zod
      .boolean()
      .default(true)
      .describe(
        'Determines if the trace recording should be automatically stopped.',
      ),
    filePath: filePathSchema,
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    context.validatePath(request.params.filePath);
    if (context.isRunningPerformanceTrace()) {
      response.appendResponseLine(
        'Error: a performance trace is already running. Use performance_stop_trace to stop it. Only one trace can be running at any given time.',
      );
      return;
    }
    context.setIsRunningPerformanceTrace(true);

    const page = request.page;
    const pageUrlForTracing = page.pptrPage.url();

    if (request.params.reload) {
      // Before starting the recording, navigate to about:blank to clear out any state.
      await page.pptrPage.goto('about:blank', {
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
    await page.pptrPage.tracing.start({
      categories,
    });

    if (request.params.reload) {
      await page.pptrPage.goto(pageUrlForTracing, {
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

export const stopTrace = definePageTool({
  name: 'performance_stop_trace',
  description:
    'Stop the active performance trace recording on the selected webpage.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
  },
  schema: {
    filePath: filePathSchema,
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    context.validatePath(request.params.filePath);
    if (!context.isRunningPerformanceTrace()) {
      return;
    }
    const page = request.page;
    await stopTracingAndAppendOutput(
      page,
      response,
      context,
      request.params.filePath,
    );
  },
});

export const analyzeInsight = definePageTool({
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
  blockedByDialog: false,
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
  page: ContextPage,
  response: Response,
  context: Context,
  filePath?: string,
): Promise<void> {
  try {
    const traceEventsBuffer = await page.pptrPage.tracing.stop();
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
      const file = await context.saveFile(
        dataToWrite,
        filePath,
        filePath.endsWith('.gz') ? '.json.gz' : '.json',
      );
      response.appendResponseLine(
        `The raw trace data was saved to ${file.filename}.`,
      );
    }
    const result = await parseRawTraceBuffer(traceEventsBuffer, {
      cpuThrottling: page.cpuThrottlingRate,
      networkThrottling: page.networkConditions ?? undefined,
    });
    response.appendResponseLine('The performance trace has been stopped.');
    if (traceResultIsSuccess(result)) {
      if (context.isCruxEnabled()) {
        await populateCruxData(result);
      }
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

/** We tell CrUXManager to fetch data so it's available when DevTools.PerformanceTraceFormatter is invoked */
async function populateCruxData(result: TraceResult): Promise<void> {
  logger('populateCruxData called');
  const cruxManager = DevTools.CrUXManager.instance();
  // go/jtfbx. Yes, we're aware this API key is public. ;)
  cruxManager.setEndpointForTesting(
    'https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=AIzaSyBn5gimNjhiEyA_euicSKko6IlD3HdgUfk',
  );
  const cruxSetting =
    DevTools.Common.Settings.Settings.instance().createSetting('field-data', {
      enabled: true,
    });
  cruxSetting.set({enabled: true});

  // Gather URLs to fetch CrUX data for
  const urls = [...(result.parsedTrace.insights?.values() ?? [])].map(c =>
    c.url.toString(),
  );
  urls.push(result.parsedTrace.data.Meta.mainFrameURL);
  const urlSet = new Set(urls);

  if (urlSet.size === 0) {
    logger('No URLs found for CrUX data');
    return;
  }

  logger(
    `Fetching CrUX data for ${urlSet.size} URLs: ${Array.from(urlSet).join(', ')}`,
  );
  const cruxData = await Promise.all(
    Array.from(urlSet).map(async url => {
      const data = await cruxManager.getFieldDataForPage(url);
      logger(`CrUX data for ${url}: ${data ? 'found' : 'not found'}`);
      return data;
    }),
  );

  // Add ratings to each CrUX record
  const cruxDataWithRatings = cruxData.map((entry: Record<string, unknown>) => ({
    ...entry,
    ratings: {
      lcp: entry.lcp !== undefined ? getCruxRating('LCP', entry.lcp as number) : undefined,
      fid: entry.fid !== undefined ? getCruxRating('FID', entry.fid as number) : undefined,
      cls: entry.cls !== undefined ? getCruxRating('CLS', entry.cls as number) : undefined,
      inp: entry.inp !== undefined ? getCruxRating('INP', entry.inp as number) : undefined,
      ttfb: entry.ttfb !== undefined ? getCruxRating('TTFB', entry.ttfb as number) : undefined,
    },
  }));
  logger(formatCruxFieldData({}));  // log format for debugging
  result.parsedTrace.metadata.cruxFieldData = cruxDataWithRatings;
}
