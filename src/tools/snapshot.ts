/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  definePageTool,
  type PageToolFactory,
  timeoutSchema,
} from './ToolDefinition.js';

export const takeSnapshot: PageToolFactory = definePageTool(() => ({
  name: 'take_snapshot',
  description: `Take a text snapshot of the target page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {
    verbose: zod
      .boolean()
      .optional()
      .describe(
        'Whether to include all possible information available in the full a11y tree. Default is false.',
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.',
      ),
  },
  blockedByDialog: true,
  concurrency: 'page',
  verifyFilesSchema: {
    filePath: true,
  },
  handler: async (request, response) => {
    response.includeSnapshot({
      verbose: request.params.verbose ?? false,
      filePath: request.params.filePath,
    });
  },
}));

export const waitFor: PageToolFactory = definePageTool(() => ({
  name: 'wait_for',
  description: `Wait for the specified text to appear on the selected page. By default, hidden text is also matched. Set visible to true to wait until the matched text is visible.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {
    text: zod
      .array(zod.string())
      .min(1)
      .describe(
        'Non-empty list of texts. Resolves when any value appears on the page.',
      ),
    ...timeoutSchema,
    visible: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, wait until the matching text is visible. By default, hidden text also counts.',
      ),
  },
  blockedByDialog: true,
  concurrency: 'page',
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const page = request.page;
    await page.waitForTextOnPage(request.params.text, {
      timeout: request.params.timeout,
      visible: request.params.visible,
    });

    response.appendResponseLine(
      `Element matching one of ${JSON.stringify(request.params.text)} found.`,
    );

    response.includeSnapshot();
  },
}));
