/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Locator} from 'puppeteer-core';
import z from 'zod';

import {formatA11ySnapshot} from '../formatters/snapshotFormatter.js';
import {ToolCategories} from './categories.js';
import {defineTool, timeoutSchema} from './ToolDefinition.js';

export const takeSnapshot = defineTool({
  name: 'take_snapshot',
  description: `Take a text snapshot of the currently selected page. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    filePath: z
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the snapshot to instead of including it in the response.',
      ),
  },
  handler: async (request, response, context) => {
    await context.createTextSnapshot();
    const snapshot = context.getTextSnapshot();

    if (!snapshot) {
      response.appendResponseLine('No snapshot data available.');
      return;
    }

    const formattedSnapshot = formatA11ySnapshot(snapshot.root);

    if (request.params.filePath) {
      const encoder = new TextEncoder();
      const data = encoder.encode(formattedSnapshot);
      const file = await context.saveFile(data, request.params.filePath);
      response.appendResponseLine(`Saved snapshot to ${file.filename}.`);
    } else {
      response.setIncludeSnapshot(true);
    }
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
