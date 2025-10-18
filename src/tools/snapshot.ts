/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Locator} from 'puppeteer-core';

import {zod} from '../third_party/modelcontextprotocol-sdk/index.js';

import {ToolCategories} from './categories.js';
import {defineTool, snapshotSchema, timeoutSchema} from './ToolDefinition.js';

export const takeSnapshot = defineTool({
  name: 'take_snapshot',
  description: `Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    ...snapshotSchema,
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
    snapshot: zod.object({
      ...snapshotSchema,
    }).optional().describe('Options for the snapshot included in the response'),
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

    response.setIncludeSnapshot(true, request.params.snapshot?.verbose ?? false);
  },
});
