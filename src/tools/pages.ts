/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {CLOSE_PAGE_ERROR, defineTool, timeoutSchema} from './ToolDefinition.js';

export const listPages = defineTool({
  name: 'list_pages',
  description: `Get a list of pages open in the browser.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response) => {
    response.setIncludePages(true);
  },
});

export const selectPage = defineTool({
  name: 'select_page',
  description: `Select a page as a context for future tool calls.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {
    pageIdx: zod
      .number()
      .describe(
        'The index of the page to select. Call list_pages to list pages.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getPageByIdx(request.params.pageIdx);
    await page.bringToFront();
    context.selectPage(page);
    response.setIncludePages(true);
  },
});

export const closePage = defineTool({
  name: 'close_page',
  description: `Closes the page by its index. The last open page cannot be closed.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    pageIdx: zod
      .number()
      .describe(
        'The index of the page to close. Call list_pages to list pages.',
      ),
  },
  handler: async (request, response, context) => {
    try {
      await context.closePage(request.params.pageIdx);
    } catch (err) {
      if (err.message === CLOSE_PAGE_ERROR) {
        response.appendResponseLine(err.message);
      } else {
        throw err;
      }
    }
    response.setIncludePages(true);
  },
});

export const newPage = defineTool({
  name: 'new_page',
  description: `Creates a new page`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().describe('URL to load in a new page.'),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = await context.newPage();

    await context.waitForEventsAfterAction(async () => {
      await page.goto(request.params.url, {
        timeout: request.params.timeout,
      });
    });

    response.setIncludePages(true);
  },
});

export const navigatePage = defineTool({
  name: 'navigate_page',
  description: `Navigates the currently selected page to a URL.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    type: zod
      .enum(['url', 'back', 'forward', 'reload'])
      .optional()
      .describe(
        'Navigate the page by URL, back or forward in history, or reload.',
      ),
    url: zod.string().optional().describe('Target URL (only type=url)'),
    ignoreCache: zod
      .boolean()
      .optional()
      .describe('Whether to ignore cache on reload.'),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const options = {
      timeout: request.params.timeout,
    };

    if (!request.params.type && !request.params.url) {
      throw new Error('Either URL or a type is required.');
    }

    if (!request.params.type) {
      request.params.type = 'url';
    }

    await context.waitForEventsAfterAction(async () => {
      switch (request.params.type) {
        case 'url':
          if (!request.params.url) {
            throw new Error('A URL is required for navigation of type=url.');
          }
          try {
            await page.goto(request.params.url, options);
            response.appendResponseLine(
              `Successfully navigated to ${request.params.url}.`,
            );
          } catch (error) {
            response.appendResponseLine(
              `Unable to navigate in the  selected page: ${error.message}.`,
            );
          }
          break;
        case 'back':
          try {
            await page.goBack(options);
            response.appendResponseLine(
              `Successfully navigated back to ${page.url()}.`,
            );
          } catch (error) {
            response.appendResponseLine(
              `Unable to navigate back in the selected page: ${error.message}.`,
            );
          }
          break;
        case 'forward':
          try {
            await page.goForward(options);
            response.appendResponseLine(
              `Successfully navigated forward to ${page.url()}.`,
            );
          } catch (error) {
            response.appendResponseLine(
              `Unable to navigate forward in the selected page: ${error.message}.`,
            );
          }
          break;
        case 'reload':
          try {
            await page.reload({
              ...options,
              ignoreCache: request.params.ignoreCache,
            });
            response.appendResponseLine(`Successfully reloaded the page.`);
          } catch (error) {
            response.appendResponseLine(
              `Unable to reload the selected page: ${error.message}.`,
            );
          }
          break;
      }
    });

    response.setIncludePages(true);
  },
});

export const resizePage = defineTool({
  name: 'resize_page',
  description: `Resizes the selected page's window so that the page has specified dimension`,
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    width: zod.number().describe('Page width'),
    height: zod.number().describe('Page height'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    // @ts-expect-error internal API for now.
    await page.resize({
      contentWidth: request.params.width,
      contentHeight: request.params.height,
    });

    response.setIncludePages(true);
  },
});

export const handleDialog = defineTool({
  name: 'handle_dialog',
  description: `If a browser dialog was opened, use this command to handle it`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    action: zod
      .enum(['accept', 'dismiss'])
      .describe('Whether to dismiss or accept the dialog'),
    promptText: zod
      .string()
      .optional()
      .describe('Optional prompt text to enter into the dialog.'),
  },
  handler: async (request, response, context) => {
    const dialog = context.getDialog();
    if (!dialog) {
      throw new Error('No open dialog found');
    }

    switch (request.params.action) {
      case 'accept': {
        try {
          await dialog.accept(request.params.promptText);
        } catch (err) {
          // Likely already handled by the user outside of MCP.
          logger(err);
        }
        response.appendResponseLine('Successfully accepted the dialog');
        break;
      }
      case 'dismiss': {
        try {
          await dialog.dismiss();
        } catch (err) {
          // Likely already handled.
          logger(err);
        }
        response.appendResponseLine('Successfully dismissed the dialog');
        break;
      }
    }

    context.clearDialog();
    response.setIncludePages(true);
  },
});
