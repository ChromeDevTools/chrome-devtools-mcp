/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {pathToFileURL} from 'node:url';

import type {ParsedArguments} from '../config/ConfigParser.js';
import {zod} from '../third_party/index.js';
import type {Frame, JSHandle, Page, WebWorker} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {defineTool, pageIdSchema} from './ToolDefinition.js';

export type Evaluatable = Page | Frame | WebWorker;

export const evaluateScript = defineTool((cliArgs: ParsedArguments) => {
  return {
    name: 'evaluate_script',
    description: `Evaluate JavaScript inside the target page${cliArgs.categoryExtensions ? ' or service worker' : ''}. The source can be provided inline or loaded from a local file. Returns the response as JSON, so returned values have to be JSON-serializable.`,
    annotations: {
      category: ToolCategory.DEBUGGING,
      readOnlyHint: false,
      conditions: ['javascriptEvaluation'],
    },
    schema: {
      ...(cliArgs.pageIdRouting
        ? cliArgs.categoryExtensions
          ? {
              pageId: zod
                .number()
                .optional()
                .describe(
                  'Targets a specific page by ID. Required when not evaluating in a service worker.',
                ),
            }
          : pageIdSchema
        : {}),
      function: zod
        .string()
        .optional()
        .describe(
          `JavaScript source to execute in the target page. Provide either this or sourcePath, but not both. The source is interpreted according to format.
Example without arguments: \`() => document.title\` or \`async () => await fetch("example.com")\`.
Example with arguments: \`(el) => el.innerText\`
`,
        ),
      sourcePath: zod
        .string()
        .optional()
        .describe(
          "The absolute or relative path to a JavaScript file on the MCP server's local filesystem. Provide either this or function, but not both.",
        ),
      format: zod
        .enum(['function', 'script'])
        .optional()
        .describe(
          'How to interpret the source. "function" treats it as a function declaration and supports args. "script" evaluates it as classic JavaScript and does not support args. Defaults to "function". ECMAScript modules are not supported.',
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
        .describe(
          `An optional list of arguments (element uids from the page content snapshot) to pass to the function.`,
        ),
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
      waitForStableDom: zod
        .boolean()
        .optional()
        .describe(
          'Whether to wait for the DOM to settle. Pass false if the script only reads data. Defaults to true.',
        ),
      ...(cliArgs.categoryExtensions
        ? {
            serviceWorkerId: zod
              .string()
              .optional()
              .describe(
                `The optional service worker id to evaluate the script in. If provided, 'pageId' should be omitted. Note: 'args' (element UIDs) cannot be used when evaluating in a service worker.`,
              ),
          }
        : {}),
    },
    blockedByDialog: false,
    verifyFilesSchema: {
      filePath: true,
      // sourcePath may be an http(s): URL the server fetches, so allow URLs
      // through; a file: path or plain path is still validated.
      sourcePath: {local: true, remote: true, allowUrl: true},
    },
    handler: async (request, response, context) => {
      const {
        serviceWorkerId,
        args: uidArgs,
        function: fnString,
        sourcePath,
        format = 'function',
        pageId,
        dialogAction,
        filePath,
        waitForStableDom,
      } = request.params;

      const source = await resolveScriptSource(fnString, sourcePath, context);
      if (format === 'script' && uidArgs && uidArgs.length > 0) {
        throw new Error('args cannot be used when format is "script".');
      }

      if (cliArgs.categoryExtensions && serviceWorkerId) {
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
              await performEvaluation(worker, source, format, [], response, {
                filePath,
                context,
              });
            },
            // Service workers cannot interact with the DOM, so never wait for it.
            {handleDialog: dialogAction ?? 'accept', waitForStableDom: false},
          );
        if (result.dialogHandled) {
          context.getSelectedMcpPage().clearDialog();
        }
        response.attachWaitForResult(result);
        return;
      }

      if (cliArgs.categoryExtensions && cliArgs.pageIdRouting && !pageId) {
        throw new Error('specify either a pageId or a serviceWorkerId.');
      }

      const mcpPage =
        cliArgs.pageIdRouting && request.params.pageId
          ? context.getPageById(request.params.pageId)
          : context.getSelectedMcpPage();
      await mcpPage.init();
      // evaluate_script is not page-scoped, so ToolHandler does not run the
      // blockedByDialog check for it. Without this, an evaluation started
      // while a dialog is open waits until the protocol timeout.
      // TODO: include the "# Open dialog ... Call handle_dialog" hint once
      // Response can attach the page for non-page-scoped tools.
      mcpPage.throwIfDialogOpen();
      const page: Page = mcpPage.pptrPage;

      const args: Array<JSHandle<unknown>> = [];
      using stack = new DisposableStack();

      const frames = new Set<Frame>();
      for (const uid of uidArgs ?? []) {
        const handle = await mcpPage.getElementByUid(uid);
        frames.add(handle.frame);
        stack.use(handle);
        args.push(handle);
      }

      const evaluatable = await getPageOrFrame(page, frames);

      const result = await mcpPage.waitForEventsAfterAction(
        async () => {
          await performEvaluation(evaluatable, source, format, args, response, {
            filePath,
            context,
          });
        },
        {handleDialog: dialogAction ?? 'accept', waitForStableDom},
      );
      response.attachWaitForResult(result);
    },
  };
});

const resolveScriptSource = async (
  inlineSource: string | undefined,
  sourcePath: string | undefined,
  context: Context,
): Promise<string> => {
  if (inlineSource !== undefined) {
    if (sourcePath !== undefined) {
      throw new Error('Specify exactly one of function or sourcePath.');
    }
    return inlineSource;
  }
  if (sourcePath === undefined) {
    throw new Error('Specify exactly one of function or sourcePath.');
  }

  const resourceUrl = sourcePath.startsWith('file:')
    ? sourcePath
    : pathToFileURL(sourcePath).href;
  try {
    return await context.loadResource(resourceUrl);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to read script source from ${sourcePath}: ${errorMessage}`,
      {cause: error},
    );
  }
};

const performEvaluation = async (
  evaluatable: Evaluatable,
  source: string,
  format: 'function' | 'script',
  args: Array<JSHandle<unknown>>,
  response: Response,
  options: {filePath?: string; context: Context},
): Promise<void> => {
  let result: string | undefined;
  if (format === 'function') {
    const functionSource = source.trimEnd().replace(/;$/, '');
    using fn = await evaluatable.evaluateHandle<
      [],
      () => (...args: unknown[]) => unknown
    >(`(\n${functionSource}\n)`);
    // Normalize non-Error values inside the page callback (serialized by Puppeteer) so CDP preserves the message.
    result = await evaluatable.evaluate(
      async (fn, ...args) => {
        try {
          return JSON.stringify(await fn(...args));
        } catch (err) {
          if (
            err instanceof Error ||
            (typeof err === 'object' &&
              err !== null &&
              'message' in err &&
              typeof err.message === 'string')
          ) {
            throw err;
          }
          let message: string;
          try {
            message =
              typeof err === 'object' && err !== null
                ? JSON.stringify(err)
                : String(err);
          } catch {
            message = String(err);
          }
          throw new Error(message);
        }
      },
      fn,
      ...args,
    );
  } else {
    using value = await evaluatable.evaluateHandle(source);
    result = await evaluatable.evaluate(value => JSON.stringify(value), value);
  }

  if (options.filePath) {
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

const getWebWorker = async (
  context: Context,
  serviceWorkerId: string,
): Promise<WebWorker> => {
  const serviceWorker = context.getWorkerById(serviceWorkerId);

  if (!serviceWorker || serviceWorker.type !== 'service_worker') {
    throw new Error('Service worker not found.');
  }

  const worker = await serviceWorker.worker();
  if (!worker) {
    throw new Error('Service worker target not found.');
  }

  return worker;
};
