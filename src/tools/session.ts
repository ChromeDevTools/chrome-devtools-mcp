/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const createSession = defineTool({
  name: 'create_session',
  description: `Creates a new Chrome browser session and returns its unique session ID. Each session runs an isolated Chrome instance. You MUST use the returned sessionId in all subsequent tool calls. Multiple sessions can run simultaneously for parallel testing.`,
  annotations: {
    category: ToolCategory.SESSION,
    readOnlyHint: false,
  },
  schema: {
    headless: zod
      .boolean()
      .optional()
      .describe('Whether to run in headless (no UI) mode. Default is false.'),
    viewport: zod
      .string()
      .optional()
      .describe(
        'Initial viewport size, e.g. "1280x720". If omitted, uses browser default.',
      ),
    label: zod
      .string()
      .optional()
      .describe(
        'A human-readable label for this session, e.g. "login-test" or "mobile-view".',
      ),
    url: zod
      .string()
      .optional()
      .describe(
        'URL to navigate to after creating the session. If omitted, opens about:blank.',
      ),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      'SESSION_PLACEHOLDER: This handler is replaced by main.ts',
    );
  },
});

export const listSessions = defineTool({
  name: 'list_sessions',
  description: `Lists all active Chrome browser sessions with their session IDs, creation times, and connection status.`,
  annotations: {
    category: ToolCategory.SESSION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response) => {
    response.appendResponseLine(
      'SESSION_PLACEHOLDER: This handler is replaced by main.ts',
    );
  },
});

export const closeSession = defineTool({
  name: 'close_session',
  description: `Closes a Chrome browser session and its associated browser instance. The sessionId cannot be used after closing.`,
  annotations: {
    category: ToolCategory.SESSION,
    readOnlyHint: false,
  },
  schema: {
    sessionId: zod
      .string()
      .describe('The session ID to close.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      'SESSION_PLACEHOLDER: This handler is replaced by main.ts',
    );
  },
});
