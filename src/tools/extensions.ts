/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const EXTENSIONS_CONDITION = 'experimentalExtensionSupport';

export const installExtension = defineTool({
  name: 'install_extension',
  description: 'Installs a Chrome extension from the given path.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    conditions: [EXTENSIONS_CONDITION],
  },
  schema: {
    path: zod
      .string()
      .trim()
      .describe('Absolute path to the unpacked extension folder.'),
  },
  handler: async (request, response, context) => {
    const {path} = request.params;
    const id = await context.installExtension(path);
    response.appendResponseLine(`Extension installed. Id: ${id}`);
  },
});

export const uninstallExtension = defineTool({
  name: 'uninstall_extension',
  description: 'Uninstalls a Chrome extension by its ID.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    conditions: [EXTENSIONS_CONDITION],
  },
  schema: {
    id: zod.string().describe('ID of the extension to uninstall.'),
  },
  handler: async (request, response, context) => {
    const {id} = request.params;
    await context.uninstallExtension(id);
    response.appendResponseLine(`Extension uninstalled. Id: ${id}`);
  },
});

export const listExtensions = defineTool({
  name: 'list_extensions',
  description:
    'Lists all installed extensions, including their name, ID, version, and enabled status.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: true,
    conditions: [EXTENSIONS_CONDITION],
  },
  schema: {},
  handler: async (request, response, context) => {
    const extensions = context.listExtensions();
    if (extensions.length === 0) {
      response.appendResponseLine('No extensions installed.');
      return;
    }
    const table = extensions.map(ext => ({
      Name: ext.name,
      ID: ext.id,
      Version: ext.version,
      Enabled: ext.isEnabled ? 'Yes' : 'No',
    }));
    response.appendResponseLine(JSON.stringify(table, null, 2));
  },
});
