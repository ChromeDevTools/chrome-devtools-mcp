/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import type {CdpPage, Dialog, Page} from '../third_party/index.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  CLOSE_PAGE_ERROR,
  definePageTool,
  defineTool,
  timeoutSchema,
} from './ToolDefinition.js';
import type {
  Context,
  UniquePageData,
  UniquePageIdentityStatus,
} from './ToolDefinition.js';

const TAB_ID_EXTENSION_NAME = "What's My Tab ID";
const UNIQUE_PAGE_TIMEOUT_MS = 1_000;

interface TabIdentityPayload {
  tabId: number;
  uid?: string;
  windowId?: number;
  tabIndex?: number;
  tabNumber?: number;
}

type UniquePageProbeResult =
  | ({identityStatus: 'resolved'} & TabIdentityPayload)
  | {
      identityStatus: Exclude<UniquePageIdentityStatus, 'resolved'>;
      error: string;
    };

async function resolveTabIdExtensionId(
  context: Context,
): Promise<string | undefined> {
  try {
    const extensions = await context.listExtensions();
    return Array.from(extensions.values()).find(
      extension => extension.name === TAB_ID_EXTENSION_NAME && extension.enabled,
    )?.id;
  } catch {
    return;
  }
}

function getIdentityStatusForUnsupportedTransport(
  url: string,
): UniquePageIdentityStatus {
  const protocol = new URL(url).protocol;
  if (
    protocol === 'chrome:' ||
    protocol === 'devtools:' ||
    protocol === 'chrome-extension:' ||
    protocol === 'edge:' ||
    protocol === 'about:'
  ) {
    return 'unsupported_page';
  }
  return 'extension_unavailable';
}

async function resolveUniquePageData(
  page: Page,
  context: Context,
  extensionId?: string,
): Promise<UniquePageData> {
  const pageId = context.getPageId(page);
  if (pageId === undefined) {
    throw new Error('Page ID not found for page.');
  }

  const baseData: UniquePageData = {
    pageId,
    tabId: null,
    selected: context.isPageSelected(page),
    url: page.url(),
    title: await page.title().catch(() => ''),
    identityStatus: 'extension_unavailable',
  };

  if (!extensionId) {
    return {
      ...baseData,
      identityStatus: getIdentityStatusForUnsupportedTransport(baseData.url),
      error: `Extension "${TAB_ID_EXTENSION_NAME}" is not installed or enabled.`,
    };
  }

  try {
    const probeResult = (await page.evaluate(
      async ({installedExtensionId, timeoutMs}) => {
        const protocol = location.protocol;
        const unsupportedProtocols = new Set([
          'chrome:',
          'devtools:',
          'chrome-extension:',
          'edge:',
          'about:',
        ]);

        const fallbackStatus: 'unsupported_page' | 'extension_unavailable' =
          unsupportedProtocols.has(protocol)
            ? 'unsupported_page'
            : 'extension_unavailable';

        const runtime = (
          globalThis as typeof globalThis & {
            chrome?: {
              runtime?: {
                lastError?: {message?: string};
                sendMessage?: (
                  extensionId: string,
                  message: {type: string},
                  callback: (response: unknown) => void,
                ) => void;
              };
            };
          }
        ).chrome?.runtime;

        const sendMessage = runtime?.sendMessage;

        if (typeof sendMessage !== 'function') {
          return {
            identityStatus: fallbackStatus,
            error: 'chrome.runtime.sendMessage is not available on this page.',
          };
        }

        return await new Promise<UniquePageProbeResult>(resolve => {
          let settled = false;
          const finish = (value: UniquePageProbeResult) => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(value);
          };

          const timer = setTimeout(() => {
            finish({
              identityStatus: 'extension_unavailable',
              error: 'Extension request timed out.',
            });
          }, timeoutMs);

          try {
            sendMessage(
              installedExtensionId,
              {type: 'GET_CURRENT_TAB_INFO'},
              (response: unknown) => {
                const typedResponse =
                  typeof response === 'object' && response !== null
                    ? (response as {
                        ok?: boolean;
                        tabId?: number;
                        uid?: string;
                        windowId?: number;
                        tabIndex?: number;
                        tabNumber?: number;
                        error?: string;
                      })
                    : {};
                const lastError = runtime?.lastError?.message ?? null;
                if (lastError) {
                  finish({
                    identityStatus: 'extension_unavailable',
                    error: lastError,
                  });
                  return;
                }
                if (typedResponse.ok && Number.isInteger(typedResponse.tabId)) {
                  const resolvedTabId = typedResponse.tabId as number;
                  finish({
                    identityStatus: 'resolved',
                    tabId: resolvedTabId,
                    uid:
                      typeof typedResponse.uid === 'string'
                        ? typedResponse.uid
                        : undefined,
                    windowId:
                      typeof typedResponse.windowId === 'number'
                        ? typedResponse.windowId
                        : undefined,
                    tabIndex:
                      typeof typedResponse.tabIndex === 'number'
                        ? typedResponse.tabIndex
                        : undefined,
                    tabNumber:
                      typeof typedResponse.tabNumber === 'number'
                        ? typedResponse.tabNumber
                        : undefined,
                  });
                  return;
                }
                if (
                  typeof typedResponse.error === 'string' &&
                  typedResponse.error.includes('Current tab is unavailable')
                ) {
                  finish({
                    identityStatus: 'no_tab_context',
                    error: typedResponse.error,
                  });
                  return;
                }
                finish({
                  identityStatus: 'script_failed',
                  error:
                    typeof typedResponse.error === 'string'
                      ? typedResponse.error
                      : 'The extension returned an unexpected response.',
                });
              },
            );
          } catch (error) {
            finish({
              identityStatus: fallbackStatus,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      },
      {
        installedExtensionId: extensionId,
        timeoutMs: UNIQUE_PAGE_TIMEOUT_MS,
      },
    )) as UniquePageProbeResult;

    if (probeResult.identityStatus === 'resolved') {
      return {
        ...baseData,
        identityStatus: 'resolved',
        tabId: probeResult.tabId,
        uid: probeResult.uid,
        windowId: probeResult.windowId,
        tabIndex: probeResult.tabIndex,
        tabNumber: probeResult.tabNumber,
      };
    }

    return {
      ...baseData,
      identityStatus: probeResult.identityStatus,
      error: probeResult.error,
    };
  } catch (error) {
    return {
      ...baseData,
      identityStatus: 'script_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function listUniquePageData(context: Context): Promise<UniquePageData[]> {
  await context.createPagesSnapshot();
  const extensionId = await resolveTabIdExtensionId(context);
  const pages = context.getPages();
  return Promise.all(
    pages.map(page => {
      return resolveUniquePageData(page, context, extensionId);
    }),
  );
}

export const listPages = defineTool(args => {
  return {
    name: 'list_pages',
    description: `Get a list of pages${args?.categoryExtensions ? ' including extension service workers' : ''} open in the browser.`,
    annotations: {
      category: ToolCategory.NAVIGATION,
      readOnlyHint: true,
    },
    schema: {},
    handler: async (_request, response) => {
      response.setIncludePages(true);
      response.setListInPageTools();
      response.setListWebMcpTools();
    },
  };
});

export const listUniquePages = defineTool({
  name: 'list_unique_pages',
  description:
    'Get a list of pages open in the browser enriched with Chrome tabId identity from the tab-ID extension when available.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const uniquePages = await listUniquePageData(context);
    response.setUniquePages(uniquePages);
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
        `The ID of the page to select. Call ${listPages().name} to get available pages.`,
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
    response.setListInPageTools();
    response.setListWebMcpTools();
    if (request.params.bringToFront) {
      await page.pptrPage.bringToFront();
    }
  },
});

export const selectUniquePage = defineTool({
  name: 'select_unique_page',
  description:
    'Select a page using its Chrome tabId as reported by the tab-ID extension.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {
    tabId: zod
      .number()
      .describe(
        `The Chrome tabId to select. Call ${listUniquePages.name} to find available tab IDs.`,
      ),
    bringToFront: zod
      .boolean()
      .optional()
      .describe('Whether to focus the page and bring it to the top.'),
  },
  handler: async (request, response, context) => {
    const uniquePages = await listUniquePageData(context);
    const match = uniquePages.find(page => page.tabId === request.params.tabId);
    if (!match) {
      throw new Error(
        `No page found for tabId ${request.params.tabId}. Call ${listUniquePages.name} to inspect current identity status.`,
      );
    }
    if (match.identityStatus !== 'resolved') {
      throw new Error(
        `Page for tabId ${request.params.tabId} is unresolved: ${match.identityStatus}.`,
      );
    }

    const page = context.getPageById(match.pageId);
    context.selectPage(page);
    response.appendResponseLine(
      `Selected page ${match.pageId} for tabId ${request.params.tabId}.`,
    );
    response.setIncludePages(true);
    response.setListInPageTools();
    response.setListWebMcpTools();
    if (request.params.bringToFront) {
      await page.pptrPage.bringToFront();
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
    response.setListInPageTools();
  },
});

export const newPage = defineTool({
  name: 'new_page',
  description: `Open a new tab and load a URL. Use project URL if not specified otherwise.`,
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
    isolatedContext: zod
      .string()
      .optional()
      .describe(
        'If specified, the page is created in an isolated browser context with the given name. ' +
          'Pages in the same browser context share cookies and storage. ' +
          'Pages in different browser contexts are fully isolated.',
      ),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = await context.newPage(
      request.params.background,
      request.params.isolatedContext,
    );

    await page.waitForEventsAfterAction(
      async () => {
        await page.pptrPage.goto(request.params.url, {
          timeout: request.params.timeout,
        });
      },
      {timeout: request.params.timeout},
    );

    response.setIncludePages(true);
    response.setListInPageTools();
  },
});

export const navigatePage = definePageTool({
  name: 'navigate_page',
  description: `Go to a URL, or back, forward, or reload. Use project URL if not specified otherwise.`,
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
  handler: async (request, response) => {
    const page = request.page;
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
        page.clearDialog();
      }
    };

    let initScriptId: string | undefined;
    if (request.params.initScript) {
      const {identifier} = await page.pptrPage.evaluateOnNewDocument(
        request.params.initScript,
      );
      initScriptId = identifier;
    }

    page.pptrPage.on('dialog', dialogHandler);

    try {
      await page.waitForEventsAfterAction(
        async () => {
          switch (request.params.type) {
            case 'url':
              if (!request.params.url) {
                throw new Error(
                  'A URL is required for navigation of type=url.',
                );
              }
              try {
                await page.pptrPage.goto(request.params.url, options);
                response.appendResponseLine(
                  `Successfully navigated to ${request.params.url}.`,
                );
              } catch (error) {
                response.appendResponseLine(
                  `Unable to navigate in the selected page: ${error.message}.`,
                );
              }
              break;
            case 'back':
              try {
                await page.pptrPage.goBack(options);
                response.appendResponseLine(
                  `Successfully navigated back to ${page.pptrPage.url()}.`,
                );
              } catch (error) {
                response.appendResponseLine(
                  `Unable to navigate back in the selected page: ${error.message}.`,
                );
              }
              break;
            case 'forward':
              try {
                await page.pptrPage.goForward(options);
                response.appendResponseLine(
                  `Successfully navigated forward to ${page.pptrPage.url()}.`,
                );
              } catch (error) {
                response.appendResponseLine(
                  `Unable to navigate forward in the selected page: ${error.message}.`,
                );
              }
              break;
            case 'reload':
              try {
                await page.pptrPage.reload({
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
      page.pptrPage.off('dialog', dialogHandler);
      if (initScriptId) {
        await page.pptrPage
          .removeScriptToEvaluateOnNewDocument(initScriptId)
          .catch(error => {
            logger(`Failed to remove init script`, error);
          });
      }
    }

    response.setIncludePages(true);
    response.setListInPageTools();
    response.setListWebMcpTools();
  },
});

export const resizePage = definePageTool({
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
  handler: async (request, response, _context) => {
    const page = request.page;

    try {
      const browser = page.pptrPage.browser();
      const windowId = await page.pptrPage.windowId();

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
    await page.pptrPage.resize({
      contentWidth: request.params.width,
      contentHeight: request.params.height,
    });

    response.setIncludePages(true);
  },
});

export const handleDialog = definePageTool({
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
  handler: async (request, response, _context) => {
    const page = request.page;
    const dialog = page.getDialog();
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

    page.clearDialog();
    response.setIncludePages(true);
  },
});

export const getTabId = definePageTool({
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
        `The ID of the page to get the tab ID for. Call ${listPages().name} to get available pages.`,
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getPageById(request.params.pageId);
    const tabId = (page.pptrPage as unknown as CdpPage)._tabId;
    response.setTabId(tabId);
  },
});
