/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {CLOSE_PAGE_ERROR, defineTool} from './ToolDefinition.js';

/**
 * Consolidated page management tool.
 * Combines: list_pages, select_page, close_page
 */
export const pages = defineTool({
  name: 'pages',
  description: 'Manage browser pages: list, select, or close.',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    op: z.enum(['list', 'select', 'close']).describe('Operation'),
    pageIdx: z.number().optional().describe('Page index (for select/close)'),
  },
  handler: async (request, response, context) => {
    const {op, pageIdx} = request.params;

    switch (op) {
      case 'list':
        response.setIncludePages(true);
        break;

      case 'select':
        if (pageIdx === undefined) {
          throw new Error('pageIdx required for select');
        }
        const selectPage = context.getPageByIdx(pageIdx);
        await selectPage.bringToFront();
        context.setSelectedPageIdx(pageIdx);
        response.setIncludePages(true);
        break;

      case 'close':
        if (pageIdx === undefined) {
          throw new Error('pageIdx required for close');
        }
        try {
          await context.closePage(pageIdx);
        } catch (err) {
          if (err.message === CLOSE_PAGE_ERROR) {
            response.appendResponseLine(err.message);
          } else {
            throw err;
          }
        }
        response.setIncludePages(true);
        break;
    }
  },
});

/**
 * Consolidated navigation tool.
 * Combines: navigate_page, navigate_page_history, new_page
 */
export const navigate = defineTool({
  name: 'navigate',
  description: 'Navigate: goto URL, back, forward, or open new page.',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    op: z.enum(['goto', 'back', 'forward', 'new']).describe('Operation'),
    url: z.string().optional().describe('URL (for goto/new)'),
  },
  handler: async (request, response, context) => {
    const {op, url} = request.params;

    switch (op) {
      case 'goto':
        if (!url) {
          throw new Error('url required for goto');
        }
        const gotoPage = context.getSelectedPage();
        await context.waitForEventsAfterAction(async () => {
          await gotoPage.goto(url);
        });
        response.setIncludePages(true);
        break;

      case 'new':
        if (!url) {
          throw new Error('url required for new');
        }
        const newPage = await context.newPage();
        await context.waitForEventsAfterAction(async () => {
          await newPage.goto(url);
        });
        response.setIncludePages(true);
        break;

      case 'back':
      case 'forward':
        const navPage = context.getSelectedPage();
        try {
          if (op === 'back') {
            await navPage.goBack();
          } else {
            await navPage.goForward();
          }
        } catch {
          response.appendResponseLine(`Unable to navigate ${op}`);
        }
        response.setIncludePages(true);
        break;
    }
  },
});

/**
 * Resize page dimensions.
 */
export const resizePage = defineTool({
  name: 'resize_page',
  description: 'Resize page dimensions.',
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    width: z.number().describe('Width'),
    height: z.number().describe('Height'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    await page.resize({
      contentWidth: request.params.width,
      contentHeight: request.params.height,
    });

    response.setIncludePages(true);
  },
});

/**
 * Handle browser dialog (alert, confirm, prompt).
 */
export const handleDialog = defineTool({
  name: 'handle_dialog',
  description: 'Handle browser dialog: accept or dismiss.',
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    action: z.enum(['accept', 'dismiss']).describe('Action'),
    promptText: z.string().optional().describe('Prompt text'),
  },
  handler: async (request, response, context) => {
    const dialog = context.getDialog();
    if (!dialog) {
      throw new Error('No open dialog found');
    }

    switch (request.params.action) {
      case 'accept':
        await dialog.accept(request.params.promptText);
        response.appendResponseLine('Dialog accepted');
        break;
      case 'dismiss':
        await dialog.dismiss();
        response.appendResponseLine('Dialog dismissed');
        break;
    }

    context.clearDialog();
    response.setIncludePages(true);
  },
});
