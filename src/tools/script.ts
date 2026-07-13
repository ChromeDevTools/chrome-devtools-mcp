/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {Frame, JSHandle, Page, WebWorker} from '../third_party/index.js';
import type {ExtensionServiceWorker} from '../types.js';

import {ToolCategory} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {defineTool, pageIdSchema} from './ToolDefinition.js';

export type Evaluatable = Page | Frame | WebWorker;

export const evaluateScript = defineTool(cliArgs => {
  return {
    name: 'evaluate_script',
    description: `Evaluate a JavaScript function inside the currently selected page${cliArgs?.categoryExtensions ? ' or service worker' : ''}${cliArgs?.experimentalWorkers ? ' or dedicated worker' : ''}. Returns the response as JSON, so returned values have to be JSON-serializable.`,
    annotations: {
      category: ToolCategory.DEBUGGING,
      readOnlyHint: false,
    },
    schema: {
      ...(cliArgs?.experimentalPageIdRouting ? pageIdSchema : {}),
      function: zod.string().describe(
        `A JavaScript function declaration to be executed by the tool in the currently selected page.
Example without arguments: \`() => document.title\` or \`async () => await fetch("example.com")\`.
Example with arguments: \`(el) => el.innerText\`
`,
      ),
      args: zod
        .array(
          zod
            .string()
            .describe(
              'The uid of an element on the page from the page content snapshot',
            ),
        )
        .optional()
        .describe(`An optional list of arguments to pass to the function.`),
      filePath: zod
        .string()
        .optional()
        .describe(
          'The absolute or relative path to a file to save the script output to. If omitted, the output is returned inline.',
        ),
      dialogAction: zod
        .string()
        .optional()
        .describe(
          'Handle dialogs while execution. "accept", "dismiss", or string for response of window.prompt. Defaults to accept.',
        ),
      ...(cliArgs?.categoryExtensions
        ? {
            serviceWorkerId: zod
              .string()
              .optional()
              .describe(
                `The optional service worker id to evaluate the script in. If provided, 'pageId' should be omitted. Note: 'args' (element UIDs) cannot be used when evaluating in a service worker.`,
              ),
          }
        : {}),
      ...(cliArgs?.experimentalWorkers
        ? {
            workerId: zod
              .string()
              .optional()
              .describe(
                `The optional dedicated worker id to evaluate the script in. Call list_dedicated_workers to obtain the available worker ids. If provided, 'pageId' should be omitted. Note: 'args' (element UIDs) cannot be used when evaluating in a worker.`,
              ),
          }
        : {}),
    },
    blockedByDialog: true,
    verifyFilesSchema: ['filePath'],
    handler: async (request, response, context) => {
      const {
        serviceWorkerId,
        workerId,
        args: uidArgs,
        function: fnString,
        pageId,
        dialogAction,
        filePath,
      } = request.params;

      if (cliArgs?.experimentalWorkers && workerId) {
        if (uidArgs && uidArgs.length > 0) {
          throw new Error(
            'args (element uids) cannot be used when evaluating in a worker.',
          );
        }
        if (pageId) {
          throw new Error('specify either a pageId or a workerId.');
        }

        const worker = getDedicatedWorker(context, workerId);
        const result = await context
          .getSelectedMcpPage()
          .waitForEventsAfterAction(
            async () => {
              await performEvaluation(worker, fnString, [], response, {
                filePath,
                context,
              });
            },
            {handleDialog: dialogAction ?? 'accept'},
          );
        if (result.dialogHandled) {
          context.getSelectedMcpPage().clearDialog();
        }
        response.attachWaitForResult(result);
        return;
      }

      if (cliArgs?.categoryExtensions && serviceWorkerId) {
        if (uidArgs && uidArgs.length > 0) {
          throw new Error(
            'args (element uids) cannot be used when evaluating in a service worker.',
          );
        }
        if (pageId) {
          throw new Error('specify either a pageId or a serviceWorkerId.');
        }

        const worker = await getWebWorker(context, serviceWorkerId);
        const result = await context
          .getSelectedMcpPage()
          .waitForEventsAfterAction(
            async () => {
              await performEvaluation(worker, fnString, [], response, {
                filePath,
                context,
              });
            },
            {handleDialog: dialogAction ?? 'accept'},
          );
        if (result.dialogHandled) {
          context.getSelectedMcpPage().clearDialog();
        }
        response.attachWaitForResult(result);
        return;
      }

      const mcpPage = cliArgs?.experimentalPageIdRouting
        ? context.getPageById(request.params.pageId)
        : context.getSelectedMcpPage();
      const page: Page = mcpPage.pptrPage;

      const args: Array<JSHandle<unknown>> = [];
      try {
        const frames = new Set<Frame>();
        for (const uid of uidArgs ?? []) {
          const handle = await mcpPage.getElementByUid(uid);
          frames.add(handle.frame);
          args.push(handle);
        }

        const evaluatable = await getPageOrFrame(page, frames);

        const result = await mcpPage.waitForEventsAfterAction(
          async () => {
            await performEvaluation(evaluatable, fnString, args, response, {
              filePath,
              context,
            });
          },
          {handleDialog: dialogAction ?? 'accept'},
        );
        response.attachWaitForResult(result);
      } finally {
        void Promise.allSettled(args.map(arg => arg.dispose()));
      }
    },
  };
});

export const listDedicatedWorkers = defineTool({
  name: 'list_dedicated_workers',
  description: `List the dedicated Web Workers running in the currently selected page. Returns a worker id for each one that can be passed as the 'workerId' argument to evaluate_script to run a script inside that worker's execution context.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalWorkers'],
  },
  schema: {},
  blockedByDialog: false,
  verifyFilesSchema: [],
  handler: async (_request, response, context) => {
    const workers = context.createDedicatedWorkersSnapshot();

    if (!workers.length) {
      response.appendResponseLine(
        'No dedicated workers found in the selected page.',
      );
      return;
    }

    response.appendResponseLine('## Dedicated Workers');
    for (const worker of workers) {
      response.appendResponseLine(`${worker.id}: ${worker.url}`);
    }
  },
});

const performEvaluation = async (
  evaluatable: Evaluatable,
  fnString: string,
  args: Array<JSHandle<unknown>>,
  response: Response,
  options?: {filePath: string; context: Context},
) => {
  const fn = await evaluatable.evaluateHandle(`(${fnString})`);
  try {
    const result = await evaluatable.evaluate(
      async (fn, ...args) => {
        // @ts-expect-error no types for function fn
        return JSON.stringify(await fn(...args));
      },
      fn,
      ...args,
    );
    if (options?.filePath) {
      const data = new TextEncoder().encode(result ?? 'undefined');
      const {filename} = await options.context.saveFile(
        data,
        options.filePath,
        '.json',
      );
      response.appendResponseLine(
        `Script ran on page. Output saved to ${filename}.`,
      );
    } else {
      response.appendResponseLine('Script ran on page and returned:');
      response.appendResponseLine('```json');
      response.appendResponseLine(`${result}`);
      response.appendResponseLine('```');
    }
  } finally {
    void fn.dispose();
  }
};

const getPageOrFrame = async (
  page: Page,
  frames: Set<Frame>,
): Promise<Page | Frame> => {
  let pageOrFrame: Page | Frame;
  // We can't evaluate the element handle across frames
  if (frames.size > 1) {
    throw new Error(
      "Elements from different frames can't be evaluated together.",
    );
  } else {
    pageOrFrame = [...frames.values()][0] ?? page;
  }

  return pageOrFrame;
};

const getDedicatedWorker = (context: Context, workerId: string): WebWorker => {
  const dedicatedWorkers = context.createDedicatedWorkersSnapshot();

  const dedicatedWorker = dedicatedWorkers.find(
    worker => context.getDedicatedWorkerId(worker) === workerId,
  );

  if (!dedicatedWorker) {
    throw new Error('Dedicated worker not found.');
  }

  return dedicatedWorker.worker;
};

const getWebWorker = async (
  context: Context,
  serviceWorkerId: string,
): Promise<WebWorker> => {
  const serviceWorkers = context.getExtensionServiceWorkers();

  const serviceWorker = serviceWorkers.find(
    (sw: ExtensionServiceWorker) =>
      context.getExtensionServiceWorkerId(sw) === serviceWorkerId,
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
