/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Locator} from 'puppeteer-core';

import {zod} from '../third_party/modelcontextprotocol-sdk/index.js';

import {ToolCategories} from './categories.js';
import {defineTool, timeoutSchema} from './ToolDefinition.js';

export const takeSnapshot = defineTool({
  name: 'take_snapshot',
  description: `Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    verbose: zod
      .boolean()
      .optional()
      .describe(
        'Whether to include all possible information available in the full a11y tree. Default is false.',
      ),
  },
  handler: async (request, response) => {
    response.setIncludeSnapshot(true, request.params.verbose ?? false);
  },
});

export const waitFor = defineTool({
  name: 'wait_for',
  description: `Wait for the specified text to appear on the selected page.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: true,
  },
  schema: {
    text: zod.string().describe('Text to appear on the page'),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const frames = page.frames();

    const locator = Locator.race(
      frames.flatMap(frame => [
        frame.locator(`aria/${request.params.text}`),
        frame.locator(`text/${request.params.text}`),
      ]),
    );

    if (request.params.timeout) {
      locator.setTimeout(request.params.timeout);
    }

    await locator.wait();

    response.appendResponseLine(
      `Element with text "${request.params.text}" found.`,
    );

    response.setIncludeSnapshot(true);
  },
});
