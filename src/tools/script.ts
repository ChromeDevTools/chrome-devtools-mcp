/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {JSHandle} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const evaluateScript = defineTool({
  name: 'evaluate_script',
  description: 'Run JavaScript in page, return JSON result.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    function: z.string().describe('JS function string'),
    args: z
      .array(z.object({uid: z.string().describe('Element uid')}))
      .optional()
      .describe('Element arguments'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const fn = await page.evaluateHandle(`(${request.params.function})`);
    const args: Array<JSHandle<unknown>> = [fn];
    try {
      for (const el of request.params.args ?? []) {
        args.push(await context.getElementByUid(el.uid));
      }
      await context.waitForEventsAfterAction(async () => {
        const result = await page.evaluate(
          async (fn, ...args) => {
            // @ts-expect-error no types.
            return JSON.stringify(await fn(...args));
          },
          ...args,
        );
        response.appendResponseLine('Result:');
        response.appendResponseLine(result);
      });
    } finally {
      Promise.allSettled(args.map(arg => arg.dispose())).catch(() => {});
    }
  },
});
