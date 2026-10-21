/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../../config/mcp-options.js';
import type {Dialog} from '../../third_party/index.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {definePageTool, type PageToolFactory} from '../ToolDefinition.js';
import {validateUrl} from '../../utils/url.js';

export const screenshot: PageToolFactory = definePageTool(() => ({
  name: 'screenshot',
  description: `Takes a png screenshot`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
    conditions: ['slim'],
  },
  schema: {
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.',
      ),
  },
  blockedByDialog: true,
  concurrency: 'page',
  verifyFilesSchema: {
    filePath: true,
  },
  handler: async (request, response, context) => {
    const page = request.page;
    const screenshot = await page.pptrPage.screenshot({
      type: 'png',
      optimizeForSpeed: true,
    });
    if (request.params.filePath) {
      const result = await context.saveFile(
        screenshot,
        request.params.filePath,
        '.png',
      );
      response.appendResponseLine(result.filename);
    } else {
      const {filepath} = await context.saveTemporaryFile(
        screenshot,
        `screenshot.png`,
      );
      response.appendResponseLine(filepath);
    }
  },
}));

export const navigate: PageToolFactory = definePageTool(
  (args: ParsedArguments) => {
    return {
      name: 'navigate',
      description: `Loads a URL`,
      annotations: {
        category: ToolCategory.NAVIGATION,
        readOnlyHint: false,
        conditions: ['slim'],
      },
      schema: {
        url: zod.string().describe('URL to navigate to'),
      },
      blockedByDialog: false,
      concurrency: 'page',
      verifyFilesSchema: {},
      handler: async (request, response) => {
        validateUrl(request.params.url, {
          javascriptEvaluation: args?.javascriptEvaluation,
          categoryExtensions: args?.categoryExtensions,
          fileNavigations: args?.fileNavigations,
        });

        const page = request.page;

        const options = {
          timeout: 30_000,
        };

        const dialogHandler = (dialog: Dialog): void => {
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
    };
  },
);

export const evaluate: PageToolFactory = definePageTool(() => ({
  name: 'evaluate',
  description: `Evaluates a JavaScript script`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['slim', 'javascriptEvaluation'],
  },
  schema: {
    script: zod.string().describe(`JS script to run on the page`),
  },
  blockedByDialog: true,
  concurrency: 'page',
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const page = request.page;
    const result = await page.pptrPage.evaluate(request.params.script);
    response.appendResponseLine(JSON.stringify(result));
  },
}));
