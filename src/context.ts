/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ensureBrowserConnected} from './browser.js';
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';

let context: McpContext | undefined;

export interface SetContextOptions {
  browserURL?: string;
  wsEndpoint?: string;
  devtools?: boolean;
  experimentalIncludeAllPages?: boolean;
  timeout?: number;
}

export async function setContext(
  options: SetContextOptions,
): Promise<McpContext> {
  const {
    browserURL,
    wsEndpoint,
    devtools = false,
    experimentalIncludeAllPages = false,
    timeout,
  } = options;

  logger('setContext called with:', {
    browserURL,
    wsEndpoint,
    devtools,
    timeout,
  });

  const connectPromise = ensureBrowserConnected({
    browserURL,
    wsEndpoint,
    devtools,
  });

  let browser;
  logger('Starting browser connection, timeout:', timeout);
  if (timeout) {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new Error(
              `Failed to connect to browser within ${timeout}ms. Please check that the browser is running and accessible at the provided URL.`,
            ),
          ),
        timeout,
      );
    });

    try {
      browser = await Promise.race([connectPromise, timeoutPromise]);
    } finally {
      // Clear timeout to prevent it from firing after connection succeeds
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  } else {
    browser = await connectPromise;
  }

  logger('Browser connection completed, browser type:', typeof browser);
  logger('Browser connected status:', browser?.connected);

  if (!browser) {
    throw new Error(
      'Failed to connect to browser: browser object is undefined',
    );
  }

  logger('Creating McpContext from browser...');
  context = await McpContext.from(browser, logger, {
    experimentalDevToolsDebugging: devtools,
    experimentalIncludeAllPages,
  });

  logger('McpContext created successfully');
  return context;
}

export function getContext(): McpContext | undefined {
  return context;
}

export function setContextInstance(newContext: McpContext | undefined): void {
  context = newContext;
}
