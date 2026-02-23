/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, timeoutSchema} from './ToolDefinition.js';

export const takeSnapshot = defineTool({
  name: 'take_snapshot',
  description: `Take a text snapshot based on the a11y tree.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {
    verbose: zod
      .boolean()
      .optional()
      .describe('Include all info from the a11y tree. Default: false.'),
    filePath: zod
      .string()
      .optional()
      .describe('Path to save snapshot. If omitted, attaches to response.'),
  },
  handler: async (request, response) => {
    response.includeSnapshot({
      verbose: request.params.verbose ?? false,
      filePath: request.params.filePath,
    });
  },
});

export const waitFor = defineTool({
  name: 'wait_for',
  description: `Waits for a text to appear.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {
    text: zod.string().describe('Text to find on the page.'),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    await context.waitForTextOnPage(
      request.params.text,
      request.params.timeout,
    );

    response.appendResponseLine(
      `Element with text "${request.params.text}" found.`,
    );

    response.includeSnapshot();
  },
});
