/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';
import type {CoverageEntry, Page} from '../third_party/index.js';
import {paginate} from '../utils/pagination.js';
import type {PaginationOptions} from '../utils/types.js';

import {ToolCategory} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {defineTool} from './ToolDefinition.js';

export interface CoverageReportEntry {
  url: string;
  totalBytes: number;
  usedBytes: number;
  unusedBytes: number;
  usagePercent: number;
  isExternal: boolean;
}

export interface CoverageReport {
  jsCoverage: CoverageReportEntry[];
  cssCoverage: CoverageReportEntry[];
  summary: {
    totalResources: number;
    totalBytes: number;
    usedBytes: number;
    unusedBytes: number;
    overallUsagePercent: number;
  };
  jsPagination?: {
    showing: string;
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  cssPagination?: {
    showing: string;
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

function isThirdParty(url: string, pageUrl: string): boolean {
  try {
    // Handle special cases
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return false; // Inline scripts/styles are internal
    }

    const urlObj = new URL(url);
    const pageUrlObj = new URL(pageUrl);

    // Different origin = definitely third-party (CDNs, external scripts)
    if (urlObj.origin !== pageUrlObj.origin) {
      return true;
    }

    // Same origin - check for vendor/third-party patterns in path
    const path = urlObj.pathname.toLowerCase();
    const thirdPartyPatterns = [
      '/vendor',
      '/vendors',
      '/node_modules',
      '/npm',
      '/lib/',
      '/libraries',
      '/deps',
      '/dependencies',
      'vendor.',
      'vendors.',
      'vendor-',
      'vendors-',
      '.vendor.',
      '.vendors.',
      'chunk.vendors',
      'chunk.libs',
    ];

    return thirdPartyPatterns.some(pattern => path.includes(pattern));
  } catch {
    // If URL parsing fails, assume internal
    return false;
  }
}

function calculateCoverageEntry(
  entry: CoverageEntry,
  pageUrl: string,
): CoverageReportEntry {
  const totalBytes = entry.text.length;
  let usedBytes = 0;
  for (const range of entry.ranges) {
    usedBytes += range.end - range.start;
  }
  const unusedBytes = totalBytes - usedBytes;
  const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return {
    url: entry.url,
    totalBytes,
    usedBytes,
    unusedBytes,
    usagePercent,
    isExternal: isThirdParty(entry.url, pageUrl),
  };
}

function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [];

  lines.push('## Coverage Report');
  lines.push('');
  lines.push('### Summary');
  lines.push(`- Total resources: ${report.summary.totalResources}`);
  lines.push(`- Total bytes: ${report.summary.totalBytes.toLocaleString()}`);
  lines.push(`- Used bytes: ${report.summary.usedBytes.toLocaleString()}`);
  lines.push(`- Unused bytes: ${report.summary.unusedBytes.toLocaleString()}`);
  lines.push(
    `- Overall usage: ${report.summary.overallUsagePercent.toFixed(1)}%`,
  );
  lines.push('');

  if (report.jsCoverage.length > 0) {
    lines.push('### JavaScript Coverage');
    lines.push('');
    if (report.jsPagination) {
      lines.push(report.jsPagination.showing);
      if (report.jsPagination.hasNextPage) {
        lines.push(`Next page: ${report.jsPagination.currentPage + 1}`);
      }
      if (report.jsPagination.hasPreviousPage) {
        lines.push(`Previous page: ${report.jsPagination.currentPage - 1}`);
      }
      lines.push('');
    }
    lines.push(
      '| URL | Type | Total Bytes | Used Bytes | Unused Bytes | Usage % |',
    );
    lines.push(
      '|-----|------|-------------|------------|--------------|---------|',
    );
    for (const entry of report.jsCoverage) {
      const shortUrl =
        entry.url.length > 50 ? '...' + entry.url.slice(-47) : entry.url;
      const type = entry.isExternal ? '3rd-party' : 'Internal';
      lines.push(
        `| ${shortUrl} | ${type} | ${entry.totalBytes.toLocaleString()} | ${entry.usedBytes.toLocaleString()} | ${entry.unusedBytes.toLocaleString()} | ${entry.usagePercent.toFixed(1)}% |`,
      );
    }
    lines.push('');
  }

  if (report.cssCoverage.length > 0) {
    lines.push('### CSS Coverage');
    lines.push('');
    if (report.cssPagination) {
      lines.push(report.cssPagination.showing);
      if (report.cssPagination.hasNextPage) {
        lines.push(`Next page: ${report.cssPagination.currentPage + 1}`);
      }
      if (report.cssPagination.hasPreviousPage) {
        lines.push(`Previous page: ${report.cssPagination.currentPage - 1}`);
      }
      lines.push('');
    }
    lines.push(
      '| URL | Type | Total Bytes | Used Bytes | Unused Bytes | Usage % |',
    );
    lines.push(
      '|-----|------|-------------|------------|--------------|---------|',
    );
    for (const entry of report.cssCoverage) {
      const shortUrl =
        entry.url.length > 50 ? '...' + entry.url.slice(-47) : entry.url;
      const type = entry.isExternal ? '3rd-party' : 'Internal';
      lines.push(
        `| ${shortUrl} | ${type} | ${entry.totalBytes.toLocaleString()} | ${entry.usedBytes.toLocaleString()} | ${entry.unusedBytes.toLocaleString()} | ${entry.usagePercent.toFixed(1)}% |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export const startCoverage = defineTool({
  name: 'coverage_start',
  description:
    'Starts code coverage tracking on the selected page. This tracks which JavaScript and CSS code is actually used, helping identify unused code that could be removed to improve page performance.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
  },
  schema: {
    resetOnNavigation: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'Whether to reset coverage data on page navigation. Defaults to true.',
      ),
    includeJS: zod
      .boolean()
      .default(true)
      .optional()
      .describe('Whether to include JavaScript coverage. Defaults to true.'),
    includeCSS: zod
      .boolean()
      .default(true)
      .optional()
      .describe('Whether to include CSS coverage. Defaults to true.'),
  },
  handler: async (request, response, context) => {
    if (context.isRunningCoverage()) {
      response.appendResponseLine(
        'Error: coverage tracking is already running. Use coverage_stop to stop it. Only one coverage session can be running at any given time.',
      );
      return;
    }

    const includeJS = request.params.includeJS ?? true;
    const includeCSS = request.params.includeCSS ?? true;

    if (!includeJS && !includeCSS) {
      response.appendResponseLine(
        'Error: at least one of includeJS or includeCSS must be true.',
      );
      return;
    }

    context.setIsRunningCoverage(true);
    context.setCoverageOptions({includeJS, includeCSS});

    const page = context.getSelectedPage();
    const resetOnNavigation = request.params.resetOnNavigation ?? true;

    try {
      const promises: Array<Promise<void>> = [];

      if (includeJS) {
        promises.push(page.coverage.startJSCoverage({resetOnNavigation}));
      }
      if (includeCSS) {
        promises.push(page.coverage.startCSSCoverage({resetOnNavigation}));
      }

      await Promise.all(promises);

      const types: string[] = [];
      if (includeJS) types.push('JavaScript');
      if (includeCSS) types.push('CSS');

      response.appendResponseLine(
        `Coverage tracking started for ${types.join(' and ')}. Use coverage_stop to stop tracking and get the report.`,
      );
    } catch (e) {
      context.setIsRunningCoverage(false);
      const errorText = e instanceof Error ? e.message : JSON.stringify(e);
      logger(`Error starting coverage: ${errorText}`);
      response.appendResponseLine(
        `Error starting coverage tracking: ${errorText}`,
      );
    }
  },
});

export const stopCoverage = defineTool({
  name: 'coverage_stop',
  description:
    'Stops code coverage tracking and returns a comprehensive report showing URLs, total bytes, used bytes, unused bytes, and usage percentage for each JavaScript and CSS resource. Results are sorted by unused bytes (most wasted first) and paginated.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .max(5)
      .default(5)
      .optional()
      .describe(
        'Number of results to show per page. Maximum and default is 5 to keep output manageable.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .default(0)
      .optional()
      .describe(
        'Page index (0-based). Use this to navigate through results. For example, pageIdx: 1 shows the next page.',
      ),
  },
  handler: async (request, response, context) => {
    if (!context.isRunningCoverage()) {
      response.appendResponseLine('Error: No coverage tracking is running.');
      response.appendResponseLine('');
      response.appendResponseLine('To use coverage tracking:');
      response.appendResponseLine(
        '1. First call coverage_start to begin tracking',
      );
      response.appendResponseLine('2. Navigate or interact with the page');
      response.appendResponseLine(
        '3. Then call coverage_stop to get the report',
      );
      return;
    }

    const page = context.getSelectedPage();
    const pagination: PaginationOptions = {
      pageSize: request.params.pageSize ?? 5,
      pageIdx: request.params.pageIdx ?? 0,
    };
    await stopCoverageAndAppendOutput(page, response, context, pagination);
  },
});

async function stopCoverageAndAppendOutput(
  page: Page,
  response: Response,
  context: Context,
  pagination: PaginationOptions,
): Promise<void> {
  try {
    const options = context.getCoverageOptions();
    const jsCoverage: CoverageReportEntry[] = [];
    const cssCoverage: CoverageReportEntry[] = [];
    const pageUrl = page.url();

    if (options.includeJS) {
      const jsEntries = await page.coverage.stopJSCoverage();
      for (const entry of jsEntries) {
        jsCoverage.push(calculateCoverageEntry(entry, pageUrl));
      }
    }

    if (options.includeCSS) {
      const cssEntries = await page.coverage.stopCSSCoverage();
      for (const entry of cssEntries) {
        cssCoverage.push(calculateCoverageEntry(entry, pageUrl));
      }
    }

    // Sort by unused bytes descending (most unused first)
    jsCoverage.sort((a, b) => b.unusedBytes - a.unusedBytes);
    cssCoverage.sort((a, b) => b.unusedBytes - a.unusedBytes);

    // Calculate summary (based on ALL entries, not just the paginated ones)
    const allEntries = [...jsCoverage, ...cssCoverage];
    const totalBytes = allEntries.reduce((sum, e) => sum + e.totalBytes, 0);
    const usedBytes = allEntries.reduce((sum, e) => sum + e.usedBytes, 0);
    const unusedBytes = allEntries.reduce((sum, e) => sum + e.unusedBytes, 0);
    const overallUsagePercent =
      totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    // Apply pagination
    const jsPaginationResult = paginate(jsCoverage, pagination);
    const cssPaginationResult = paginate(cssCoverage, pagination);

    const report: CoverageReport = {
      jsCoverage: [...jsPaginationResult.items],
      cssCoverage: [...cssPaginationResult.items],
      summary: {
        totalResources: allEntries.length,
        totalBytes,
        usedBytes,
        unusedBytes,
        overallUsagePercent,
      },
      jsPagination:
        jsCoverage.length > 0
          ? {
              showing: `Showing ${jsPaginationResult.startIndex + 1}-${jsPaginationResult.endIndex} of ${jsCoverage.length} JS files (Page ${jsPaginationResult.currentPage + 1} of ${jsPaginationResult.totalPages})`,
              currentPage: jsPaginationResult.currentPage,
              totalPages: jsPaginationResult.totalPages,
              hasNextPage: jsPaginationResult.hasNextPage,
              hasPreviousPage: jsPaginationResult.hasPreviousPage,
            }
          : undefined,
      cssPagination:
        cssCoverage.length > 0
          ? {
              showing: `Showing ${cssPaginationResult.startIndex + 1}-${cssPaginationResult.endIndex} of ${cssCoverage.length} CSS files (Page ${cssPaginationResult.currentPage + 1} of ${cssPaginationResult.totalPages})`,
              currentPage: cssPaginationResult.currentPage,
              totalPages: cssPaginationResult.totalPages,
              hasNextPage: cssPaginationResult.hasNextPage,
              hasPreviousPage: cssPaginationResult.hasPreviousPage,
            }
          : undefined,
    };

    response.appendResponseLine('Coverage tracking has been stopped.');
    response.appendResponseLine('');
    response.appendResponseLine(formatCoverageReport(report));
  } catch (e) {
    const errorText = e instanceof Error ? e.message : JSON.stringify(e);
    logger(`Error stopping coverage: ${errorText}`);
    response.appendResponseLine(
      'An error occurred generating the coverage report:',
    );
    response.appendResponseLine(errorText);
  } finally {
    context.setIsRunningCoverage(false);
  }
}
