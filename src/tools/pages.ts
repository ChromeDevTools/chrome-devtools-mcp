/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {logger} from '../logger.js';

import {ToolCategories} from './categories.js';
import {CLOSE_PAGE_ERROR, defineTool, timeoutSchema} from './ToolDefinition.js';

export const listPages = defineTool({
  name: 'list_pages',
  description: `Get a list of pages open in the browser.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
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
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: true,
  },
  schema: {
    pageIdx: z
      .number()
      .describe(
        'The index of the page to select. Call list_pages to list pages.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getPageByIdx(request.params.pageIdx);
    await page.bringToFront();
    context.setSelectedPageIdx(request.params.pageIdx);
    response.setIncludePages(true);
  },
});

export const closePage = defineTool({
  name: 'close_page',
  description: `Closes the page by its index. The last open page cannot be closed.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    pageIdx: z
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
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    url: z.string().describe('URL to load in a new page.'),
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
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    url: z.string().describe('URL to navigate the page to'),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    await context.waitForEventsAfterAction(async () => {
      await page.goto(request.params.url, {
        timeout: request.params.timeout,
      });
    });

    response.setIncludePages(true);
  },
});

export const navigatePageHistory = defineTool({
  name: 'navigate_page_history',
  description: `Navigates the currently selected page.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    navigate: z
      .enum(['back', 'forward'])
      .describe(
        'Whether to navigate back or navigate forward in the selected pages history',
      ),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const options = {
      timeout: request.params.timeout,
    };
    try {
      if (request.params.navigate === 'back') {
        await page.goBack(options);
      } else {
        await page.goForward(options);
      }
    } catch {
      response.appendResponseLine(
        `Unable to navigate ${request.params.navigate} in currently selected page.`,
      );
    }

    response.setIncludePages(true);
  },
});

export const resizePage = defineTool({
  name: 'resize_page',
  description: `Resizes the selected page's window so that the page has specified dimension`,
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    width: z.number().describe('Page width'),
    height: z.number().describe('Page height'),
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
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    action: z
      .enum(['accept', 'dismiss'])
      .describe('Whether to dismiss or accept the dialog'),
    promptText: z
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
