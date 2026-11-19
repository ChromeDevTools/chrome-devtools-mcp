/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../config/mcp-options.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool, type PageToolFactory} from './ToolDefinition.js';
import {STOP_COVERAGE_TOOL_NAME} from './toolNames.js';

function coverageTypesLabel(js: boolean, css: boolean): string {
  if (js && css) {
    return 'JavaScript and CSS';
  }
  if (js) {
    return 'JavaScript';
  }
  return 'CSS';
}

export const startCoverage: PageToolFactory = definePageTool(() => ({
  name: 'start_coverage',
  description:
    'Starts JavaScript and/or CSS coverage on the selected page. ' +
    'Call this, interact with the page, then call ' +
    `${STOP_COVERAGE_TOOL_NAME} for a compact unused-bytes report. ` +
    'Coverage is not retained across navigations: the report only covers ' +
    'the document loaded after the last navigation. To include page load, ' +
    'call navigate_page with type reload after this tool. ' +
    'Starting twice without stopping is an error. ' +
    'Coverage cannot run during a performance trace because it skews timings.',
  annotations: {
    category: ToolCategory.COVERAGE,
    readOnlyHint: false,
  },
  schema: {
    js: zod
      .boolean()
      .default(true)
      .describe('Collect JavaScript coverage. Default: true.'),
    css: zod
      .boolean()
      .default(true)
      .describe('Collect CSS coverage. Default: true.'),
  },
  blockedByDialog: true,
  concurrency: 'page',
  verifyFilesSchema: {},
  handler: async (request, response, context) => {
    if (context.isRunningPerformanceTrace()) {
      throw new Error(
        'A performance trace is running. Coverage skews trace timings, so stop the trace with performance_stop_trace before calling start_coverage.',
      );
    }
    const {js, css} = request.params;
    await request.page.startCoverage({js, css});
    response.appendResponseLine(
      `${coverageTypesLabel(js, css)} coverage collection has started. ` +
        `Interact with the page, then call ${STOP_COVERAGE_TOOL_NAME} to get the report.`,
    );
  },
}));

export const stopCoverage: PageToolFactory = definePageTool(
  (args: ParsedArguments) => ({
    name: 'stop_coverage',
    description:
      'Stops coverage on the selected page and returns a compact report. ' +
      'Each resource lists type, total bytes, used bytes, unused bytes, ' +
      'and unused percent. Rows are sorted by unused bytes and capped at ' +
      'the top 20. Errors if start_coverage was not called on this page.',
    annotations: {
      category: ToolCategory.COVERAGE,
      readOnlyHint: false,
    },
    schema: {},
    blockedByDialog: true,
    concurrency: 'page',
    verifyFilesSchema: {},
    handler: async (request, response, context) => {
      if (!request.page.isRunningCoverage()) {
        const other = context
          .getPages()
          .find(page => page !== request.page && page.isRunningCoverage());
        if (other) {
          const actionHint = args.pageIdRouting
            ? `Pass pageId: ${other.id} to stop_coverage to stop it.`
            : `Select page ${other.id} with select_page first, then call stop_coverage.`;
          throw new Error(
            `Coverage is running on page ${other.id}, not on page ${request.page.id}. ${actionHint}`,
          );
        }
      }
      response.attachCoverageReport(await request.page.stopCoverage());
    },
  }),
);
