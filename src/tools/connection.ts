/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const disconnectBrowser = defineTool({
  name: 'disconnect_browser',
  description:
    'Release the current connection to Chrome without exiting the MCP server.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (_request, response, context) => {
    await context.disconnect();
    response.appendResponseLine(
      'Browser connection released. The next tool call will reconnect.',
    );
  },
});
