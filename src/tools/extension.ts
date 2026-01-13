/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '../logger.js';
import { zod } from '../third_party/index.js';

import { ToolCategory } from './categories.js';
import { defineTool } from './ToolDefinition.js';

export const installExtension = defineTool({
  name: 'install_extension',
  description: 'Installs a Chrome extension from the given path.',
  annotations: {
    category: ToolCategory.EXTENSION,
    readOnlyHint: false,
  },
  schema: {
    path: zod
      .string()
      .describe('Absolute path to the unpacked extension folder.'),
  },
  handler: async (request, response, context) => {
    const { path } = request.params;
    try {
      const id = await context.installExtension(path);
      response.appendResponseLine(`Extension installed: ${id}`);
    } catch (error) {
      logger('Extension installation error: ', error);
      throw error;
    }
  },
});
