/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ANONYMOUS_COVERAGE_URL,
  type CoverageReport,
  type CoverageResource,
} from '../tools/ToolDefinition.js';
import {truncateUrl} from '../utils/text.js';

export const MAX_COVERAGE_ROWS = 20;

export interface CoverageReportJson {
  resources: CoverageResource[];
  omitted: number;
  totals: CoverageReport['totals'];
}

function formatPercent(value: number): string {
  return value.toFixed(1);
}

function formatResource(resource: CoverageResource): string {
  return (
    `${resource.url} ${resource.type} ` +
    `total=${resource.totalBytes} used=${resource.usedBytes} ` +
    `unused=${resource.unusedBytes} unused%=${formatPercent(
      resource.unusedPercent,
    )}`
  );
}

function displayUrl(url: string): string {
  if (url === ANONYMOUS_COVERAGE_URL) {
    return url;
  }
  return truncateUrl(url);
}

export class CoverageFormatter {
  readonly #report: CoverageReport;

  constructor(report: CoverageReport) {
    this.#report = report;
  }

  toJSON(): CoverageReportJson {
    const omitted = Math.max(
      0,
      this.#report.resources.length - MAX_COVERAGE_ROWS,
    );
    return {
      resources: this.#report.resources
        .slice(0, MAX_COVERAGE_ROWS)
        .map(resource => {
          return {
            ...resource,
            url: displayUrl(resource.url),
          };
        }),
      omitted,
      totals: this.#report.totals,
    };
  }

  toString(): string {
    const {resources, omitted, totals} = this.toJSON();
    const lines = ['## Coverage report'];
    if (resources.length === 0) {
      lines.push(
        'No coverage data. The page may have no script or stylesheet, or coverage was reset on navigation.',
      );
    } else {
      for (const resource of resources) {
        lines.push(formatResource(resource));
      }
    }
    lines.push(
      `Totals: ${totals.resources} resources, ${totals.totalBytes} total bytes, ` +
        `${totals.usedBytes} used, ${totals.unusedBytes} unused (` +
        `${formatPercent(totals.unusedPercent)}% unused)`,
    );
    if (omitted > 0) {
      const noun = omitted === 1 ? 'resource' : 'resources';
      lines.push(`${omitted} more ${noun} not shown.`);
    }
    return lines.join('\n');
  }
}
