/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool, type PageToolFactory} from './ToolDefinition.js';

export const getCssStyles: PageToolFactory = definePageTool(() => ({
  name: 'get_css_styles',
  description: `Retrieve computed styles, matched CSS rules, inline styles (element.style), inherited styles, custom properties, and cascade wrappers (@layer, @media, @container, @scope) for an element identified by its UID.
Computed styles for the target element itself (not its pseudo-elements) appears as the first entry, showing display, width, height, and properties from matched or inherited rules; pass computedProperties to include additional CSS properties in Computed styles.
Matched CSS rules follow from highest to lowest cascade precedence and include source line numbers (e.g. index:196). Active (winning) declarations have no prefix tag, while (losing) overridden declarations are prefixed with [overloaded]. Declarations referencing custom properties via var() include their resolved token values as inline comments (e.g. color: var(--brand); /* #ff0000 */). Computed styles shows final browser-computed longhand values.
Treat the matched cascade and computed values as authoritative.
Results are paginated (10 entries per page by default); use pageIdx to page through the remaining rules. Requires a UID from take_snapshot.`,
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
    computedProperties: zod
      .array(zod.string())
      .optional()
      .describe(
        'Additional CSS property names (in kebab-case, e.g. "position", "z-index", "overflow") to include in Computed styles even when not matched by any CSS rule.',
      ),
  },
  blockedByDialog: true,
  concurrency: 'page',
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const styles = await request.page.getCssStylesForUid(request.params.uid);
    response.setIncludeCssStyles(styles, {
      uid: request.params.uid,
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
      computedProperties: request.params.computedProperties,
    });
  },
}));
