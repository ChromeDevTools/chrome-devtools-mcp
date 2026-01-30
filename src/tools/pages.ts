/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import type {Dialog} from '../third_party/index.js';
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
    pageId: zod
      .number()
      .describe(
        `The ID of the page to select. Call ${listPages.name} to get available pages.`,
      ),
    bringToFront: zod
      .boolean()
      .optional()
      .describe('Whether to focus the page and bring it to the top.'),
  },
  handler: async (request, response, context) => {
    const page = context.getPageById(request.params.pageId);
    context.selectPage(page);
    response.setIncludePages(true);
    if (request.params.bringToFront) {
      await page.bringToFront();
    }
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
    pageId: zod
      .number()
      .describe('The ID of the page to close. Call list_pages to list pages.'),
  },
  handler: async (request, response, context) => {
    try {
      await context.closePage(request.params.pageId);
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
    background: zod
      .boolean()
      .optional()
      .describe(
        'Whether to open the page in the background without bringing it to the front. Default is false (foreground).',
      ),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = await context.newPage(request.params.background);

    await context.waitForEventsAfterAction(
      async () => {
        await page.goto(request.params.url, {
          timeout: request.params.timeout,
        });
      },
      {timeout: request.params.timeout},
    );

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
    handleBeforeUnload: zod
      .enum(['accept', 'decline'])
      .optional()
      .describe(
        'Whether to auto accept or beforeunload dialogs triggered by this navigation. Default is accept.',
      ),
    initScript: zod
      .string()
      .optional()
      .describe(
        'A JavaScript script to be executed on each new document before any other scripts for the next navigation.',
      ),
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

    const handleBeforeUnload = request.params.handleBeforeUnload ?? 'accept';
    const dialogHandler = (dialog: Dialog) => {
      if (dialog.type() === 'beforeunload') {
        if (handleBeforeUnload === 'accept') {
          response.appendResponseLine(`Accepted a beforeunload dialog.`);
          void dialog.accept();
        } else {
          response.appendResponseLine(`Declined a beforeunload dialog.`);
          void dialog.dismiss();
        }
        // We are not going to report the dialog like regular dialogs.
        context.clearDialog();
      }
    };

    let initScriptId: string | undefined;
    if (request.params.initScript) {
      const {identifier} = await page.evaluateOnNewDocument(
        request.params.initScript,
      );
      initScriptId = identifier;
    }

    page.on('dialog', dialogHandler);

    try {
      await context.waitForEventsAfterAction(
        async () => {
          switch (request.params.type) {
            case 'url':
              if (!request.params.url) {
                throw new Error(
                  'A URL is required for navigation of type=url.',
                );
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
        },
        {timeout: request.params.timeout},
      );
    } finally {
      page.off('dialog', dialogHandler);
      if (initScriptId) {
        await page
          .removeScriptToEvaluateOnNewDocument(initScriptId)
          .catch(error => {
            logger(`Failed to remove init script`, error);
          });
      }
    }

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

    try {
      const browser = page.browser();
      const windowId = await page.windowId();

      const bounds = await browser.getWindowBounds(windowId);

      if (bounds.windowState === 'fullscreen') {
        // Have to call this twice on Ubuntu when the window is in fullscreen mode.
        await browser.setWindowBounds(windowId, {windowState: 'normal'});
        await browser.setWindowBounds(windowId, {windowState: 'normal'});
      } else if (bounds.windowState !== 'normal') {
        await browser.setWindowBounds(windowId, {windowState: 'normal'});
      }
    } catch {
      // Window APIs are not supported on all platforms
    }
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

export const getTabId = defineTool({
  name: 'get_tab_id',
  description: `Get the tab ID of the page`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
    conditions: ['experimentalInteropTools'],
  },
  schema: {
    pageId: zod
      .number()
      .describe(
        `The ID of the page to get the tab ID for. Call ${listPages.name} to get available pages.`,
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getPageById(request.params.pageId);
    // @ts-expect-error _tabId is internal.
    const tabId = page._tabId;
    response.setTabId(tabId);
  },
});
