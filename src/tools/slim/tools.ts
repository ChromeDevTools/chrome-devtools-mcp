/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Dialog} from '../../third_party/index.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {definePageTool} from '../ToolDefinition.js';

export const screenshot = definePageTool({
  name: 'screenshot',
  description:
    'Viewport PNG saved to a temp path (--slim mode; minimal footprint).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    const page = request.page;
    const screenshot = await page.pptrPage.screenshot({
      type: 'png',
      optimizeForSpeed: true,
    });
    const {filepath} = await context.saveTemporaryFile(
      screenshot,
      `screenshot.png`,
    );
    response.appendResponseLine(filepath);
  },
});

export const navigate = definePageTool({
  name: 'navigate',
  description:
    'Navigate the selected tab to url (--slim; accepts beforeunload).',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().describe('URL to navigate to'),
  },
  handler: async (request, response) => {
    const page = request.page;

    const options = {
      timeout: 30_000,
    };

    const dialogHandler = (dialog: Dialog) => {
      if (dialog.type() === 'beforeunload') {
        response.appendResponseLine(`Accepted a beforeunload dialog.`);
        void dialog.accept();
        // We are not going to report the dialog like regular dialogs.
        page.clearDialog();
      }
    };

    page.pptrPage.on('dialog', dialogHandler);

    try {
      await page.pptrPage.goto(request.params.url, options);
      response.appendResponseLine(`Navigated to ${page.pptrPage.url()}.`);
    } finally {
      page.pptrPage.off('dialog', dialogHandler);
    }
  },
});

export const evaluate = definePageTool({
  name: 'evaluate',
  description:
    'Evaluate a script string in page context; returns text/JSON (--slim).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    script: zod.string().describe(`JS script to run on the page`),
  },
  handler: async (request, response) => {
    const page = request.page;
    try {
      const result = await page.pptrPage.evaluate(request.params.script);
      response.appendResponseLine(JSON.stringify(result));
    } catch (err) {
      response.appendResponseLine(String(err.message));
    }
  },
});
