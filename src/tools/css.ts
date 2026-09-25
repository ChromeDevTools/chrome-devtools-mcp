/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const getCssStyles = definePageTool(() => ({
  name: 'get_css_styles',
  description: `Retrieve matched CSS rules, inline styles (element.style), inherited styles, custom properties, and cascade wrappers (@layer, @media, @container, @scope) for an element identified by its UID.
Rules are ordered from highest to lowest cascade precedence and include source line numbers (e.g. index:196). Active (winning) declarations have no prefix tag, while (losing) overridden declarations are prefixed with [overloaded].
Treat the output as authoritative and complete.
Results are paginated (10 rules per page by default); use pageIdx to page through the remaining rules. Requires a UID from take_snapshot.`,
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
      .default(10)
      .describe(
        'Maximum number of CSS rules to return per page. Defaults to 10.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .default(0)
      .describe(
        'Page number to return (0-based). Defaults to 0 (the first page).',
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
}));
