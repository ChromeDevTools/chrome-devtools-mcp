/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {z} from 'zod';

import {CHATGPT_CONFIG} from '../config.js';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// Default development bookmarks
function getDefaultBookmarks(): Record<string, string> {
  return {
    'dashboard': 'https://chrome.google.com/webstore/devconsole',
    'new_item': 'https://chrome.google.com/webstore/devconsole/register',
    'analytics': 'https://chrome.google.com/webstore/devconsole/analytics',
    'payments': 'https://chrome.google.com/webstore/devconsole/payments',
    'support': 'https://support.google.com/chrome_webstore/contact/developer_support',
    'extensions': 'chrome://extensions/',
    'extensions_dev': 'chrome://extensions/?id=',
    'policy': 'https://developer.chrome.com/docs/webstore/program-policies/',
    'docs': 'https://developer.chrome.com/docs/extensions/',
    'localhost': 'http://localhost:3000',
    'localhost8080': 'http://localhost:8080',
    'chatgpt': CHATGPT_CONFIG.DEFAULT_URL
  };
}

/**
 * Consolidated bookmarks tool.
 * Combines: list_bookmarks, navigate_bookmark
 */
export const bookmarks = defineTool({
  name: 'bookmarks',
  description: 'Bookmarks: list or navigate to URL.',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    op: z.enum(['list', 'navigate']).describe('Operation'),
    name: z.string().optional().describe('Bookmark name (for navigate)'),
  },
  handler: async (request, response, context) => {
    const {op, name} = request.params;
    const allBookmarks = getDefaultBookmarks();

    if (op === 'list') {
      const bookmarkNames = Object.keys(allBookmarks);
      if (bookmarkNames.length === 0) {
        response.appendResponseLine('No bookmarks configured.');
        return;
      }
      response.appendResponseLine('Available bookmarks:');
      bookmarkNames.forEach(n => {
        response.appendResponseLine(`  ${n}: ${allBookmarks[n]}`);
      });
      return;
    }

    // op === 'navigate'
    if (!name) {
      throw new Error('name required for navigate');
    }

    if (!allBookmarks[name]) {
      response.appendResponseLine(`Bookmark "${name}" not found.`);
      response.appendResponseLine('Available: ' + Object.keys(allBookmarks).join(', '));
      return;
    }

    const url = allBookmarks[name];
    const page = context.getSelectedPage();

    await context.waitForEventsAfterAction(async () => {
      await page.goto(url, {waitUntil: 'networkidle0'});
      response.appendResponseLine(`Navigated to "${name}": ${url}`);
    });
  },
});

/**
 * Open extension by ID.
 */
export const openExtensionById = defineTool({
  name: 'open_extension_by_id',
  description: 'Open extension page by ID.',
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
    page: z.enum(['details', 'options']).default('details').describe('Page type'),
  },
  handler: async (request, response, context) => {
    const {extensionId, page: extensionPage} = request.params;
    const pageContext = context.getSelectedPage();

    const url = extensionPage === 'details'
      ? `chrome://extensions/?id=${extensionId}`
      : `chrome-extension://${extensionId}/options.html`;

    await context.waitForEventsAfterAction(async () => {
      try {
        await pageContext.goto(url, {waitUntil: 'networkidle0'});
        response.appendResponseLine(`Opened ${extensionPage} for ${extensionId}`);
      } catch (error) {
        response.appendResponseLine(
          `Failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});

/**
 * Open Web Store dashboard.
 */
export const openWebstoreDashboard = defineTool({
  name: 'open_webstore_dashboard',
  description: 'Open Chrome Web Store developer dashboard.',
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();
    const url = 'https://chrome.google.com/webstore/devconsole';

    await context.waitForEventsAfterAction(async () => {
      await page.goto(url, {waitUntil: 'networkidle0'});
      response.appendResponseLine('Opened Web Store Dashboard');
    });
  },
});

/**
 * Open extension docs.
 */
export const openExtensionDocs = defineTool({
  name: 'open_extension_docs',
  description: 'Open Chrome Extensions documentation.',
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    section: z
      .enum(['overview', 'getting-started', 'api', 'manifest', 'examples', 'best-practices'])
      .optional()
      .describe('Doc section'),
  },
  handler: async (request, response, context) => {
    const {section} = request.params;
    const page = context.getSelectedPage();

    const sectionUrls: Record<string, string> = {
      overview: 'https://developer.chrome.com/docs/extensions/',
      'getting-started': 'https://developer.chrome.com/docs/extensions/get-started/',
      api: 'https://developer.chrome.com/docs/extensions/reference/',
      manifest: 'https://developer.chrome.com/docs/extensions/reference/manifest',
      examples: 'https://github.com/GoogleChrome/chrome-extensions-samples',
      'best-practices': 'https://developer.chrome.com/docs/extensions/develop/migrate',
    };

    const url = section ? sectionUrls[section] : 'https://developer.chrome.com/docs/extensions/';

    await context.waitForEventsAfterAction(async () => {
      await page.goto(url, {waitUntil: 'networkidle0'});
      response.appendResponseLine(`Opened ${section || 'main'} docs`);
    });
  },
});
