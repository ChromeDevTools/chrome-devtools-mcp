/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Lighthouse, zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const lighthouseAudit = defineTool({
  name: 'lighthouse_audit',
  description: `Runs a Lighthouse accessibility audit on the currently selected page. This tool analyzes the page for accessibility issues and provides a detailed report with scores and recommendations.`,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const url = page.url();

    const flags = {
      onlyCategories: ['accessibility'],
    };

    const result = await Lighthouse.default(url, flags, undefined, page);
    const lhr = result!.lhr;
    const accessibilityCategory = lhr.categories.accessibility;

    const failedAudits = Object.values(lhr.audits).filter(
      audit => audit.score !== null && audit.score < 1,
    );
    const passedAudits = Object.values(lhr.audits).filter(
      audit => audit.score === 1,
    );

    const output = {
      Accessibility: {
        score: accessibilityCategory?.score ?? null,
        failedAudits,
        passedAudits,
      },
    };

    response.appendResponseLine(JSON.stringify(output, null, 2));
  },
});
