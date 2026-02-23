/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {Frame, JSHandle, Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const evaluateScript = defineTool({
  name: 'evaluate_script',
  description: `Evaluate a JavaScript function. Returns the response as JSON, so returned values have to be JSON-serializable.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    function: zod
      .string()
      .describe(
        `JS function to run on the page. Ex: \`() => document.title\`, or with args: \`(el) => el.innerText\`.`,
      ),
    args: zod
      .array(
        zod.object({
          uid: zod.string().describe('uid of an element from the snapshot.'),
        }),
      )
      .optional()
      .describe(`Optional arguments for the function.`),
  },
  handler: async (request, response, context) => {
    const args: Array<JSHandle<unknown>> = [];
    try {
      const frames = new Set<Frame>();
      for (const el of request.params.args ?? []) {
        const handle = await context.getElementByUid(el.uid);
        frames.add(handle.frame);
        args.push(handle);
      }
      let pageOrFrame: Page | Frame;
      // We can't evaluate the element handle across frames
      if (frames.size > 1) {
        throw new Error(
          "Elements from different frames can't be evaluated together.",
        );
      } else {
        pageOrFrame = [...frames.values()][0] ?? context.getSelectedPage();
      }
      const fn = await pageOrFrame.evaluateHandle(
        `(${request.params.function})`,
      );
      args.unshift(fn);
      await context.waitForEventsAfterAction(async () => {
        const result = await pageOrFrame.evaluate(
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
      void Promise.allSettled(args.map(arg => arg.dispose()));
    }
  },
});
