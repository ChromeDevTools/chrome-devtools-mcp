/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Locator} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const takeSnapshot = defineTool({
  name: 'take_snapshot',
  description: `Take a text snapshot of the currently selected page. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response) => {
    response.setIncludeSnapshot(true);
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
    text: z.string().describe('Text to appear on the page'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    await Locator.race([
      page.locator(`aria/${request.params.text}`),
      page.locator(`text/${request.params.text}`),
    ]).wait();

    response.appendResponseLine(
      `Element with text "${request.params.text}" found.`,
    );

    response.setIncludeSnapshot(true);
  },
});
