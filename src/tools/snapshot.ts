/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool, timeoutSchema} from './ToolDefinition.js';

export const takeSnapshot = definePageTool({
  name: 'take_snapshot',
  description: `Take a text snapshot using the a11y tree. Lists elements with a unique ID (uid). Prefer snapshots over screenshots. Indicates the element selected in the DevTools Elements panel.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {
    verbose: zod
      .boolean()
      .optional()
      .describe('Include all info in the a11y tree. If omitted: false'),
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.',
      ),
  },
  handler: async (request, response) => {
    response.includeSnapshot({
      verbose: request.params.verbose ?? false,
      filePath: request.params.filePath,
    });
  },
});

export const waitFor = definePageTool({
  name: 'wait_for',
  description: `Wait for the specified text to appear on the page.`,
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
  },
  handler: async (request, response, context) => {
    const page = request.page;
    await context.waitForTextOnPage(
      request.params.text,
      request.params.timeout,
      page.pptrPage,
    );

    response.appendResponseLine(
      `Element matching one of ${JSON.stringify(request.params.text)} found.`,
    );

    response.includeSnapshot();
  },
});
