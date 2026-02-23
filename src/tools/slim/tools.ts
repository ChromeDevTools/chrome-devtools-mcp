/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Dialog} from '../../third_party/index.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import type {ToolDefinition} from '../ToolDefinition.js';
import {defineTool} from '../ToolDefinition.js';

export const screenshot = defineTool({
  name: 'screenshot',
  description: `Takes a screenshot.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const screenshot = await page.screenshot({
      type: 'png',
      optimizeForSpeed: true,
    });
    const {filename} = await context.saveTemporaryFile(screenshot, `image/png`);
    response.appendResponseLine(filename);
  },
});

export const navigate = defineTool({
  name: 'navigate',
  description: `Loads a URL.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().describe('URL to navigate to.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const options = {
      timeout: 30_000,
    };

    const dialogHandler = (dialog: Dialog) => {
      if (dialog.type() === 'beforeunload') {
        response.appendResponseLine(`Accepted a beforeunload dialog.`);
        void dialog.accept();
        // We are not going to report the dialog like regular dialogs.
        context.clearDialog();
      }
    };

    page.on('dialog', dialogHandler);

    try {
      await page.goto(request.params.url, options);
      response.appendResponseLine(`Navigated to ${page.url()}.`);
    } finally {
      page.off('dialog', dialogHandler);
    }
  },
});

export const evaluate = defineTool({
  name: 'evaluate',
  description: `Evaluates a JavaScript function.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    fn: zod.string().describe(`JS function to run on the page.`),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const fn = await page.evaluateHandle(`(${request.params.fn})`);
    try {
      const result = await page.evaluate(async fn => {
        // @ts-expect-error no types.
        return JSON.stringify(await fn());
      }, fn);
      response.appendResponseLine(result);
    } catch (err) {
      response.appendResponseLine(String(err.message));
    } finally {
      void fn.dispose();
    }
  },
});

export const tools = [screenshot, evaluate, navigate] as ToolDefinition[];
