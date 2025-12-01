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
  description: 'Get page elements with uids. Prefer over screenshot.',
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
  description: 'Wait for text to appear on page.',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: true,
  },
  schema: {
    text: z.string().describe('Text to wait for'),
    timeout: z.number().optional().describe('Timeout ms (default: 30000)'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const timeout = request.params.timeout ?? 30000;

    let locator = Locator.race([
      page.locator(`aria/${request.params.text}`),
      page.locator(`text/${request.params.text}`),
    ]);
    locator = locator.setTimeout(timeout);
    await locator.wait();

    response.appendResponseLine(`Found: "${request.params.text}"`);
    response.setIncludeSnapshot(true);
  },
});
