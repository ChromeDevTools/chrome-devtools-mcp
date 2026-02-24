/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {Frame, JSHandle, Page, WebWorker} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import type {Context} from './ToolDefinition.js';
import {defineTool} from './ToolDefinition.js';

export type Evaluatable = Page | Frame | WebWorker;

export const evaluateScriptTool = defineTool((enableExtensions: boolean) => {
  return {
    name: 'evaluate_script',
    description: `Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON,
so returned values have to be JSON-serializable.`,
    annotations: {
      category: ToolCategory.DEBUGGING,
      readOnlyHint: false,
    },
    schema: {
      function: zod.string().describe(
        `A JavaScript function declaration to be executed by the tool in the currently selected page.
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
      args: zod
        .array(
          zod.object({
            uid: zod
              .string()
              .describe(
                'The uid of an element on the page from the page content snapshot',
              ),
          }),
        )
        .optional()
        .describe(`An optional list of arguments to pass to the function.`),
      ...(enableExtensions
        ? {
            serviceWorkerId: zod
              .string()
              .optional()
              .describe(
                `An optional service worker id to evaluate the script in.`,
              ),
          }
        : {}),
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

        const evaluatable = await getEvaluatable(
          context,
          frames,
          enableExtensions,
          request.params.serviceWorkerId as string | undefined,
        );

        const fn = await evaluatable.evaluateHandle(
          `(${request.params.function})`,
        );
        args.unshift(fn);

        await context.waitForEventsAfterAction(async () => {
          const result = await evaluatable.evaluate(
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
  };
});

const getEvaluatable = async (
  context: Context,
  frames: Set<Frame>,
  enableExtensions: boolean,
  serviceWorkerId?: string,
): Promise<Evaluatable> => {
  if (enableExtensions && serviceWorkerId) {
    return getWebWorker(context, serviceWorkerId);
  }
  return getPageOrFrame(context, frames);
};

const getPageOrFrame = async (
  context: Context,
  frames: Set<Frame>,
): Promise<Page | Frame> => {
  let pageOrFrame: Page | Frame;
  // We can't evaluate the element handle across frames
  if (frames.size > 1) {
    throw new Error(
      "Elements from different frames can't be evaluated together.",
    );
  } else {
    pageOrFrame = [...frames.values()][0] ?? context.getSelectedPage();
  }

  return pageOrFrame;
};

const getWebWorker = async (
  context: Context,
  serviceWorkerId: string,
): Promise<WebWorker> => {
  const serviceWorkers = context.getExtensionServiceWorkers();

  const serviceWorker = serviceWorkers.find(
    sw => context.getExtensionServiceWorkerId(sw) === serviceWorkerId,
  );

  if (serviceWorker && serviceWorker.target) {
    const worker = await serviceWorker.target.worker();

    if (!worker) {
      throw new Error('Service worker target not found.');
    }

    return worker;
  } else {
    throw new Error('Service worker not found.');
  }
};
