/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  switchActiveBrowser,
  listBrowsers,
  addBrowser,
} from '../browser.js';
import {zod} from '../third_party/index.js';
import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const switch_browser = defineTool({
  name: 'switch_browser',
  description:
    'Switch the active browser instance. All subsequent tool calls will operate on the selected browser.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    browserId: zod
      .string()
      .describe(
        'The ID of the browser to switch to. Call list_browsers to see available browsers.',
      ),
  },
  handler: async (request, response) => {
    const {browserId} = request.params;
    switchActiveBrowser(browserId);
    response.appendResponseLine(
      `Switched to browser '${browserId}'. All future tool calls will target this browser.`,
    );
    response.appendResponseLine(`Active browser: ${browserId}`);
  },
});

export const list_browsers = defineTool({
  name: 'list_browsers',
  description:
    'List all connected browser instances with their IDs and connection status.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response) => {
    const browsers = listBrowsers();
    if (browsers.length === 0) {
      response.appendResponseLine('No browsers connected.');
      return;
    }
    response.appendResponseLine('## Connected browsers');
    for (const b of browsers) {
      const marker = b.active ? ' [selected]' : '';
      const status = b.connected ? 'connected' : 'disconnected';
      response.appendResponseLine(`- ${b.id}: ${status}${marker}`);
    }
  },
});

export const add_browser = defineTool({
  name: 'add_browser',
  description:
    'Connect to an additional Chrome browser instance on a different debugging port.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    browserId: zod
      .string()
      .describe(
        'A unique ID for this browser instance (e.g. "admin", "test-user", "dev").',
      ),
    browserUrl: zod
      .string()
      .describe(
        'The debugging URL of the Chrome instance (e.g. "http://127.0.0.1:9224").',
      ),
    switchTo: zod
      .boolean()
      .optional()
      .describe(
        'Whether to immediately switch to this browser after connecting. Default is true.',
      ),
  },
  handler: async (request, response) => {
    const {browserId, browserUrl, switchTo = true} = request.params;
    try {
      await addBrowser(browserId, {browserURL: browserUrl});
      response.appendResponseLine(
        `Browser '${browserId}' connected successfully at ${browserUrl}.`,
      );
      if (switchTo) {
        switchActiveBrowser(browserId);
        response.appendResponseLine(`Switched to browser '${browserId}'.`);
      }
      const browsers = listBrowsers();
      response.appendResponseLine('\n## All browsers');
      for (const b of browsers) {
        const marker = b.active ? ' [selected]' : '';
        response.appendResponseLine(
          `- ${b.id}: ${b.connected ? 'connected' : 'disconnected'}${marker}`,
        );
      }
    } catch (err) {
      throw new Error(
        `Failed to connect to browser '${browserId}' at ${browserUrl}: ${(err as Error).message}`,
      );
    }
  },
});
