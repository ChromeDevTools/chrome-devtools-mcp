/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import zlib from 'node:zlib';

import {logger} from '../logger.js';
import {zod, DevTools} from '../third_party/index.js';
import type {Page, SerializedAXNode} from '../third_party/index.js';
import type {InsightName, TraceResult} from '../trace-processing/parse.js';
import {
  getLayoutShifts,
  getLCPBreakdownData,
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../trace-processing/parse.js';

import {ToolCategory} from './categories.js';
import {LAYOUT_SHIFT_UI_CONTENT} from './layout_shift_ui.js';
import {LCP_UI_CONTENT} from './lcp_breakdown_ui.js';
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
  description:
    'Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.\n\nCRITICAL: To record with custom network or CPU throttling, call `pick_emulation_settings` and THIS TOOL in the SAME EXECUTION TURN. DO NOT respond to the user, DO NOT pause for interaction, and DO NOT wait for user confirmation. The emulation module remains active in the background.',
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

export const showLCPBreakdown = defineTool({
  name: 'performance_show_lcp_breakdown',
  description:
    'Displays a visual breakdown of the Largest Contentful Paint (LCP) phases and highlights the LCP element. Use this tool when you want to provide a rich graphical representation of LCP insights.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  _meta: {
    ui: {
      resourceUri: 'ui://performance/lcp-breakdown',
      visibility: ['model', 'app'],
    },
  },
  schema: {},
  handler: async (_request, response, context) => {
    // Reference LCP_UI_CONTENT to avoid unused var error (it's actually used by main.ts, but eslint doesn't know)
    void LCP_UI_CONTENT;
    const lastRecording = context.recordedTraces().at(-1);
    if (!lastRecording) {
      response.appendResponseLine(
        'No recorded traces found. Record a performance trace so you have Insights to analyze.',
      );
      return;
    }

    const lcpDataWithScreenshot = await getLCPDataWithScreenshot(
      context,
      lastRecording,
    );

    if (!lcpDataWithScreenshot) {
      response.appendResponseLine(
        'No LCP data found in the current recording.',
      );
      return;
    }

    response.appendResponseLine('LCP Breakdown UI opened.');
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify({lcpData: lcpDataWithScreenshot}, null, 2),
    );
    response.appendResponseLine('```');
  },
});

export const showLayoutShiftBreakdown = defineTool({
  name: 'performance_show_layout_shift_breakdown',
  description:
    'Displays a visual breakdown of Layout Shifts and shows before and after snapshots of each shift. Use this tool when you want to see exactly how and when layout shifts occurred on the page.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  _meta: {
    ui: {
      resourceUri: 'ui://performance/layout-shift-breakdown',
      visibility: ['model', 'app'],
    },
  },
  schema: {},
  handler: async (_request, response, context) => {
    // Reference LAYOUT_SHIFT_UI_CONTENT to avoid unused var error
    void LAYOUT_SHIFT_UI_CONTENT;
    const lastRecording = context.recordedTraces().at(-1);
    if (!lastRecording) {
      response.appendResponseLine(
        'No recorded traces found. Record a performance trace so you have layout shifts to analyze.',
      );
      return;
    }

    const shifts = getLayoutShifts(lastRecording);

    if (shifts.length === 0) {
      response.appendResponseLine(
        'No layout shifts found in the current recording.',
      );
      return;
    }

    response.appendResponseLine('Layout Shift Breakdown UI opened.');
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify({layoutShifts: shifts}, null, 2),
    );
    response.appendResponseLine('```');
  },
});

async function getLCPDataWithScreenshot(
  context: Context,
  lastRecording: TraceResult,
) {
  let finalInsightSetId: string | undefined;
  if (lastRecording.insights) {
    // Find the last insight set that has LCP data
    const ids = Array.from(lastRecording.insights.keys());
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i];
      const lcpData = getLCPBreakdownData(lastRecording, id);
      if (lcpData && lcpData.lcpMs > 0) {
        finalInsightSetId = id;
        break;
      }
    }
  }

  if (!finalInsightSetId) {
    return null;
  }

  const lcpData = getLCPBreakdownData(lastRecording, finalInsightSetId);
  if (!lcpData) {
    return null;
  }

  let screenshot: string | undefined;
  if (lcpData.backendNodeId) {
    const page = context.getSelectedPage();
    try {
      const root = await page.accessibility.snapshot({includeIframes: true});
      if (root) {
        const node = findAXNode(root, lcpData.backendNodeId);
        if (node) {
          const handle = await node.elementHandle();
          if (handle) {
            const screenshotBuffer = await handle.screenshot({
              type: 'png',
              optimizeForSpeed: true,
            });
            screenshot = Buffer.from(screenshotBuffer).toString('base64');
            await handle.dispose();
          }
        }
      }
    } catch (e) {
      logger(`Error highlighting/screenshotting LCP element: ${e}`);
    }
  }

  return {
    ...lcpData,
    screenshot,
  };
}

function findAXNode(
  node: SerializedAXNode,
  backendNodeId: number,
): SerializedAXNode | null {
  // @ts-expect-error backendNodeId is not in standard types but present at runtime
  if (node.backendNodeId === backendNodeId) {
    return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findAXNode(child, backendNodeId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

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

  result.parsedTrace.metadata.cruxFieldData = cruxData;
}
