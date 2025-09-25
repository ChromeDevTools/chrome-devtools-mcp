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
  description: `Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON
so returned values have to JSON-serializable.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    function: z.string().describe(
      `A JavaScript function to run in the currently selected page.
Example without arguments: \`() => {
  return document.title
}\` or \`async () => {
  return await fetch("example.com")
}\`.
Example with arguments: \`(el) => {
  return el.innerText;
}\`
`,
    ),
    args: z
      .array(
        z.object({
          uid: z
            .string()
            .describe(
              'The uid of an element on the page from the page content snapshot',
            ),
        }),
      )
      .optional()
      .describe(`An optional list of arguments to pass to the function.`),
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
        response.appendResponseLine('Script ran on page and returned:');
        response.appendResponseLine('```json');
        response.appendResponseLine(`${result}`);
        response.appendResponseLine('```');
      });
    } finally {
      Promise.allSettled(args.map(arg => arg.dispose())).catch(() => {
        // Ignore errors
      });
    }
  },
});
