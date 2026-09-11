/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const getCssStyles = definePageTool({
  name: 'get_css_styles',
  description: `Retrieve matched CSS rules, inline styles, inherited styles, and cascade information for an element identified by its UID.
Use this tool to debug why specific CSS properties are applied, overridden, or conflicting. Supports pagination for elements with many matched rules. Requires a UID from take_snapshot.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of the element on the page from the page content snapshot to inspect CSS styles for',
      ),
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of CSS rules to return per page. When omitted, returns all rules.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const matchedStyles = await request.page.getMatchedStylesForUid(
      request.params.uid,
    );
    response.setIncludeCssStyles(matchedStyles, {
      uid: request.params.uid,
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
    });
  },
});
