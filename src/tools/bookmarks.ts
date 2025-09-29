/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// Read bookmarks from environment variables
function getBookmarks(): Record<string, string> {
  const bookmarksEnv = process.env.BOOKMARKS;
  if (!bookmarksEnv) {
    return {};
  }

  try {
    return JSON.parse(bookmarksEnv);
  } catch (error) {
    console.warn('Failed to parse BOOKMARKS environment variable:', error);
    return {};
  }
}

export const listBookmarks = defineTool({
  name: 'list_bookmarks',
  description: `List all available bookmarks configured in the MCP server. These bookmarks provide quick access to commonly used development URLs.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, _context) => {
    const bookmarks = getBookmarks();
    const bookmarkNames = Object.keys(bookmarks);

    if (bookmarkNames.length === 0) {
      response.appendResponseLine('No bookmarks configured.');
      response.appendResponseLine('');
      response.appendResponseLine(
        '💡 **Tip:** Configure bookmarks using the BOOKMARKS environment variable in your MCP server settings.',
      );
      return;
    }

    response.appendResponseLine('📚 **Available Bookmarks:**');
    response.appendResponseLine('');

    bookmarkNames.forEach(name => {
      const url = bookmarks[name];
      response.appendResponseLine(`• **${name}**: ${url}`);
    });

    response.appendResponseLine('');
    response.appendResponseLine(
      `Use \`navigate_bookmark name="<bookmark_name>"\` to navigate to any of these URLs.`,
    );
  },
});

export const navigateBookmark = defineTool({
  name: 'navigate_bookmark',
  description: `Navigate to a predefined bookmark URL. Bookmarks are configured in the MCP server environment and provide quick access to commonly used development resources.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    name: z
      .string()
      .describe(
        'The name of the bookmark to navigate to. Use list_bookmarks to see available options.',
      ),
  },
  handler: async (request, response, context) => {
    const {name} = request.params;
    const bookmarks = getBookmarks();

    if (!bookmarks[name]) {
      response.appendResponseLine(`❌ Bookmark "${name}" not found.`);
      response.appendResponseLine('');

      const availableBookmarks = Object.keys(bookmarks);
      if (availableBookmarks.length > 0) {
        response.appendResponseLine('Available bookmarks:');
        availableBookmarks.forEach(bookmarkName => {
          response.appendResponseLine(`• ${bookmarkName}`);
        });
      } else {
        response.appendResponseLine('No bookmarks are currently configured.');
      }
      return;
    }

    const url = bookmarks[name];
    const page = context.getSelectedPage();

    await context.waitForEventsAfterAction(async () => {
      await page.goto(url, {waitUntil: 'networkidle0'});
      response.appendResponseLine(`✅ Navigated to bookmark "${name}": ${url}`);
    });
  },
});

export const openExtensionById = defineTool({
  name: 'open_extension_by_id',
  description: `Open a specific Chrome extension page by its ID. Useful for quickly accessing extension details, options, or management pages.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .describe('The Chrome extension ID (e.g., "abcdefghijklmnopqrstuvwxyz")'),
    page: z
      .enum(['details', 'options'])
      .default('details')
      .describe('The extension page to open'),
  },
  handler: async (request, response, context) => {
    const {extensionId, page: extensionPage} = request.params;
    const pageContext = context.getSelectedPage();

    let url: string;
    if (extensionPage === 'details') {
      url = `chrome://extensions/?id=${extensionId}`;
    } else {
      url = `chrome-extension://${extensionId}/options.html`;
    }

    await context.waitForEventsAfterAction(async () => {
      try {
        await pageContext.goto(url, {waitUntil: 'networkidle0'});
        response.appendResponseLine(
          `✅ Opened ${extensionPage} page for extension: ${extensionId}`,
        );
      } catch (error) {
        response.appendResponseLine(
          `❌ Failed to open extension page: ${error instanceof Error ? error.message : String(error)}`,
        );
        response.appendResponseLine('');
        response.appendResponseLine('💡 **Possible reasons:**');
        response.appendResponseLine(
          '• Extension ID is invalid or extension is not installed',
        );
        response.appendResponseLine(
          '• Extension does not have an options page (for options page requests)',
        );
        response.appendResponseLine('• Extension is disabled');
      }
    });
  },
});

export const openWebstoreDashboard = defineTool({
  name: 'open_webstore_dashboard',
  description: `Open the Chrome Web Store developer dashboard. Provides quick access to extension management, analytics, and publishing tools.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();
    const dashboardUrl = 'https://chrome.google.com/webstore/devconsole';

    await context.waitForEventsAfterAction(async () => {
      await page.goto(dashboardUrl, {waitUntil: 'networkidle0'});
      response.appendResponseLine(
        '✅ Opened Chrome Web Store Developer Dashboard',
      );
      response.appendResponseLine('');
      response.appendResponseLine('🚀 **Quick Actions Available:**');
      response.appendResponseLine(
        '• View and manage your published extensions',
      );
      response.appendResponseLine('• Check analytics and user feedback');
      response.appendResponseLine('• Upload new versions or create new items');
      response.appendResponseLine(
        '• Review policy compliance and store listing details',
      );
    });
  },
});

export const openExtensionDocs = defineTool({
  name: 'open_extension_docs',
  description: `Open the Chrome Extensions documentation. Provides access to the official development guides, API references, and best practices.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    section: z
      .enum([
        'overview',
        'getting-started',
        'api',
        'manifest',
        'examples',
        'best-practices',
      ])
      .optional()
      .describe('Specific documentation section to open'),
  },
  handler: async (request, response, context) => {
    const {section} = request.params;
    const page = context.getSelectedPage();

    let url = 'https://developer.chrome.com/docs/extensions/';

    if (section) {
      const sectionUrls: Record<string, string> = {
        overview: 'https://developer.chrome.com/docs/extensions/',
        'getting-started':
          'https://developer.chrome.com/docs/extensions/get-started/',
        api: 'https://developer.chrome.com/docs/extensions/reference/',
        manifest:
          'https://developer.chrome.com/docs/extensions/reference/manifest',
        examples: 'https://github.com/GoogleChrome/chrome-extensions-samples',
        'best-practices':
          'https://developer.chrome.com/docs/extensions/develop/migrate',
      };
      url = sectionUrls[section] || url;
    }

    await context.waitForEventsAfterAction(async () => {
      await page.goto(url, {waitUntil: 'networkidle0'});
      response.appendResponseLine(
        `✅ Opened Chrome Extensions ${section ? `${section} ` : ''}documentation`,
      );
    });
  },
});
