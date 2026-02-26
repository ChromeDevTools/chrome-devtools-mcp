/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import {
  snapshot,
  navigation,
  generateReport,
  zod,
  type Flags,
  type RunnerResult,
  type OutputMode,
} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const lighthouseAudit = defineTool({
  name: 'lighthouse_audit',
  description: `Get Lighthouse score and reports for accessibility, SEO and best practices.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    pageScoped: true,
  },
  schema: {
    mode: zod
      .enum(['navigation', 'snapshot'])
      .default('navigation')
      .describe(
        '"navigation" reloads & audits. "snapshot" analyzes current state.',
      ),
    device: zod
      .enum(['desktop', 'mobile'])
      .default('desktop')
      .describe('Device to emulate.'),
    outputDirPath: zod
      .string()
      .optional()
      .describe('Directory for reports. If omitted, uses temporary files.'),
  },
  handler: async (request, response, context) => {
    const page = request.page!;
    const categories = ['accessibility', 'seo', 'best-practices'];
    const formats = ['json', 'html'] as OutputMode[];
    const {
      mode = 'navigation',
      device = 'desktop',
      outputDirPath,
    } = request.params;

    const flags: Flags = {
      onlyCategories: categories,
      output: formats,
      // Default 30 second timeout for page load.
      maxWaitForLoad: 30_000,
    };

    if (device === 'desktop') {
      flags.formFactor = 'desktop';
      flags.screenEmulation = {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      };
    } else {
      flags.formFactor = 'mobile';
      flags.screenEmulation = {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 1.75,
        disabled: false,
      };
    }

    let result: RunnerResult | undefined;
    try {
      if (mode === 'navigation') {
        result = await navigation(page, page.url(), {
          flags,
        });
      } else {
        result = await snapshot(page, {
          flags,
        });
      }

      if (!result) {
        throw new Error('Lighthouse audit failed.');
      }
    } finally {
      await context.restoreEmulation();
    }

    const lhr = result.lhr;
    const reportPaths: string[] = [];

    const encoder = new TextEncoder();
    for (const format of formats) {
      const report = generateReport(lhr, format);
      const data = encoder.encode(report);
      if (outputDirPath) {
        const reportPath = path.join(outputDirPath, `report.${format}`);
        const {filename} = await context.saveFile(data, reportPath);
        reportPaths.push(filename);
      } else {
        const {filepath} = await context.saveTemporaryFile(
          data,
          `report.${format}`,
        );
        reportPaths.push(filepath);
      }
    }

    const categoryScores = Object.values(lhr.categories).map(c => ({
      id: c.id,
      title: c.title,
      score: c.score,
    }));

    const failedAudits = Object.values(lhr.audits).filter(
      a => a.score !== null && a.score < 1,
    ).length;

    const passedAudits = Object.values(lhr.audits).filter(
      a => a.score === 1,
    ).length;

    const output = {
      summary: {
        mode,
        device,
        url: lhr.mainDocumentUrl,
        scores: categoryScores,
        audits: {
          failed: failedAudits,
          passed: passedAudits,
        },
        timing: {
          total: lhr.timing.total,
        },
      },
      reports: reportPaths,
    };

    response.attachLighthouseResult(output);
  },
});
