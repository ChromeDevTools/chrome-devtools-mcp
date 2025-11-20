/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {disconnectBrowser} from '../browser.js';
import {args} from '../config.js';
import {setContext} from '../context.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

async function convertHttpToBrowserUrl(
  url: string,
  timeout: number = 10000,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${url}/json/version`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch browser info: ${response.statusText}`);
    }
    const data = await response.json();
    return data.webSocketDebuggerUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Provide clearer error message for timeout/abort
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Connection timeout: Could not reach browser at ${url} within ${timeout}ms. Make sure the browser is running and accessible.`,
      );
    }

    throw new Error(
      `Could not connect to browser at ${url}: ${message}. Make sure the browser is running and the URL is correct.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export const switchBrowser = defineTool({
  name: 'switch_browser',
  description: `Connect to a different browser instance. Disconnects from the current browser (if any) and establishes a new connection. Accepts either HTTP URLs (e.g., http://127.0.0.1:9222) or WebSocket endpoints (e.g., ws://127.0.0.1:9222/devtools/browser/<id>).`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    url: zod
      .string()
      .describe(
        'Browser connection URL. Can be an HTTP URL (e.g., http://127.0.0.1:9222) which will be auto-converted to WebSocket, or a direct WebSocket endpoint (e.g., ws://127.0.0.1:52862/devtools/browser/<id>).',
      ),
    timeout: zod
      .number()
      .optional()
      .describe(
        'Connection timeout in milliseconds. Defaults to 10000 (10 seconds). If the connection cannot be established within this time, an error will be thrown.',
      ),
  },
  handler: async (request, response, _context) => {
    const {url, timeout = 10000} = request.params;

    // Disconnect from current browser
    await disconnectBrowser();

    // Determine if it's HTTP or WebSocket URL
    let wsEndpoint: string | undefined;
    let browserURL: string | undefined;

    const urlObj = new URL(url);

    if (urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:') {
      // Direct WebSocket endpoint
      wsEndpoint = url;
      response.appendResponseLine(
        `Connecting to browser via WebSocket: ${url}`,
      );
    } else if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      // HTTP URL - need to convert to WebSocket
      response.appendResponseLine(
        `Fetching WebSocket endpoint from browser at ${url}...`,
      );
      wsEndpoint = await convertHttpToBrowserUrl(url, timeout);
      response.appendResponseLine(`Resolved WebSocket endpoint: ${wsEndpoint}`);
      browserURL = url;
    } else {
      throw new Error(
        `Unsupported protocol: ${urlObj.protocol}. Expected http://, https://, ws://, or wss://`,
      );
    }

    // Connect to the new browser
    await setContext({
      browserURL,
      wsEndpoint,
      devtools: args.experimentalDevtools ?? false,
      experimentalIncludeAllPages: args.experimentalIncludeAllPages,
      timeout,
    });

    response.appendResponseLine(`✓ Successfully connected to browser`);
    response.setIncludePages(true);
  },
});
