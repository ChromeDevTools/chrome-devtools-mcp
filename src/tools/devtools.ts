/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const emulateNetwork = defineTool({
  name: 'list_devtools_data',
  description: `Returns data (network requests) that the user is currently inspecting in DevTools.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, _context) => {
    response.includeDevtoolsData(true);
  },
});
