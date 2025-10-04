/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {z} from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {CHATGPT_CONFIG} from '../config.js';

// Chrome bookmark file interface
interface ChromeBookmark {
  id: string;
  name: string;
  type: 'url' | 'folder';
  url?: string;
  children?: ChromeBookmark[];
}

interface ChromeBookmarksFile {
  roots: {
    bookmark_bar: ChromeBookmark;
    other: ChromeBookmark;
    synced: ChromeBookmark;
  };
}

// Default hardcoded bookmarks - fallback when Chrome bookmarks cannot be loaded
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
    'suno': 'https://suno.com/create',
    'chatgpt': CHATGPT_CONFIG.DEFAULT_URL
  };
}

/**
 * Get Chrome bookmarks file path based on the operating system
 */
function getChromeBookmarksPath(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  switch (platform) {
    case 'darwin': // macOS
      return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Bookmarks');
    case 'win32': // Windows
      return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks');
    case 'linux': // Linux
      return path.join(homeDir, '.config', 'google-chrome', 'Default', 'Bookmarks');
    default:
      return path.join(homeDir, '.config', 'google-chrome', 'Default', 'Bookmarks');
  }
}

/**
 * Recursively extract bookmark URLs from Chrome bookmark structure
 */
function extractBookmarkUrls(bookmark: ChromeBookmark, prefix: string = ''): Record<string, string> {
  const result: Record<string, string> = {};
  const MAX_BOOKMARKS = 100; // Limit to 100 bookmarks to prevent response size issues
  let bookmarkCount = 0;

  // Helper function to recursively extract bookmarks with limit
  function extract(node: ChromeBookmark) {
    if (bookmarkCount >= MAX_BOOKMARKS) return;

    if (node.type === 'url' && node.url && node.name) {
      // Create a safe key from bookmark name
      const key = node.name.toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

      if (key && !result[key]) {
        result[key] = node.url;
        bookmarkCount++;
      }
    }

    if (node.children && bookmarkCount < MAX_BOOKMARKS) {
      for (const child of node.children) {
        extract(child);
        if (bookmarkCount >= MAX_BOOKMARKS) break;
      }
    }
  }

  extract(bookmark);
  return result;
}

/**
 * Load Chrome bookmarks from the user's Chrome profile
 */
function loadChromeBookmarks(): Record<string, string> {
  try {
    const bookmarksPath = getChromeBookmarksPath();
    console.error(`📚 Attempting to load Chrome bookmarks from: ${bookmarksPath}`);

    if (!fs.existsSync(bookmarksPath)) {
      console.error(`⚠️  Chrome bookmarks file not found: ${bookmarksPath}`);
      return {};
    }

    const bookmarksData = fs.readFileSync(bookmarksPath, 'utf8');
    const bookmarksJson: ChromeBookmarksFile = JSON.parse(bookmarksData);

    const allBookmarks: Record<string, string> = {};

    // Extract bookmarks from all roots
    Object.assign(allBookmarks, extractBookmarkUrls(bookmarksJson.roots.bookmark_bar));
    Object.assign(allBookmarks, extractBookmarkUrls(bookmarksJson.roots.other));
    Object.assign(allBookmarks, extractBookmarkUrls(bookmarksJson.roots.synced));

    const bookmarkCount = Object.keys(allBookmarks).length;
    console.error(`✅ Successfully loaded ${bookmarkCount} Chrome bookmarks${bookmarkCount >= 100 ? ' (limited to 100)' : ''}`);
    return allBookmarks;
  } catch (error) {
    console.error('❌ Failed to load Chrome bookmarks:');
    console.error('   Path:', getChromeBookmarksPath());
    console.error('   Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('   Stack:', error.stack);
    }
    return {};
  }
}

/**
 * Get all bookmarks: returns only default development bookmarks for privacy
 * User's personal Chrome bookmarks are not loaded to protect privacy
 */
function getBookmarks(): Record<string, string> {
  return getDefaultBookmarks();
}

export const listBookmarks = defineTool({
  name: 'list_bookmarks',
  description: `List all available bookmarks. Returns hardcoded development bookmarks only. User's personal Chrome bookmarks are not loaded to protect privacy.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, _context) => {
    const allBookmarks = getBookmarks();
    const bookmarkNames = Object.keys(allBookmarks);

    if (bookmarkNames.length === 0) {
      response.appendResponseLine('No bookmarks configured.');
      return;
    }

    response.appendResponseLine('📚 **Available Development Bookmarks:**');
    response.appendResponseLine('');

    bookmarkNames.forEach(name => {
      const url = allBookmarks[name];
      response.appendResponseLine(`🔧 **${name}**: ${url}`);
    });

    response.appendResponseLine('');
    response.appendResponseLine(
      `Use \`navigate_bookmark name="<bookmark_name>"\` to navigate to any of these URLs.`,
    );
  },
});

export const navigateBookmark = defineTool({
  name: 'navigate_bookmark',
  description: `Navigate to a bookmark URL from default development bookmarks. User's personal Chrome bookmarks are not loaded to protect privacy.`,
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
