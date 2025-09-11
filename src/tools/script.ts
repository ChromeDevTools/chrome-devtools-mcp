/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import z from 'zod';
import {defineTool} from './ToolDefinition.js';
import {ToolCategories} from './categories.js';
import {waitForEventsAfterAction} from '../waitForHelpers.js';

export const evaluateScript = defineTool({
  name: 'evaluate_script',
  description: `Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    function: z
      .string()
      .describe(
        'A JavaScript function to run in the currently selected page. Example: `() => {return document.title}` or `async () => {return await fetch("example.com")}`',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    const script = `(async () => {
      return JSON.stringify(await (${request.params.function})());
    })()`;

    await waitForEventsAfterAction(page, async () => {
      const result = await page.evaluate(script);
      response.appendResponseLine('Script ran on page and returned:');
      response.appendResponseLine('```json');
      response.appendResponseLine(`${result}`);
      response.appendResponseLine('```');
    });
  },
});
