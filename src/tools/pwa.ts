/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const manifestIdSchema = zod
  .string()
  .describe(
    'The manifest ID of the web app: the resolved `id` member of its manifest. ' +
      'If `id` is omitted, it defaults to the resolved `start_url` ' +
      '(e.g. "https://example.com/"). See https://w3c.github.io/manifest/#id-member.',
  );

const displayModeSchema = zod
  .enum(['standalone', 'browser'])
  .optional()
  .describe(
    'Optional user display mode preference applied after install. ' +
      '"standalone" opens the app in its own window; "browser" opens it as a ' +
      'tab. Installs via the PWA CDP domain default to "browser" because they ' +
      'do not simulate the install dialog, so pass "standalone" to get an ' +
      'app-window experience.',
  );

export const installPwa = defineTool({
  name: 'install_pwa',
  description:
    'Installs a Progressive Web App (PWA) identified by its manifest ID. ' +
    'This installs through the PWA CDP domain without a user gesture or install ' +
    'dialog. DevTools installs default to browser display mode.',
  annotations: {
    category: ToolCategory.PWA,
    readOnlyHint: false,
  },
  schema: {
    manifestId: manifestIdSchema,
    installUrlOrBundleUrl: zod
      .string()
      .describe(
        'The location of the app or bundle. For a normal site this is the page ' +
          'URL; for an Isolated Web App it can be a file:// or http(s):// ' +
          'signed web bundle.',
      ),
    displayMode: displayModeSchema,
  },
  blockedByDialog: false,
  // We do not validate file paths for remote browser instances
  // because they are on the remote host and not accessed by the MCP server.
  verifyFilesSchema: {
    installUrlOrBundleUrl: {
      local: true,
      remote: false,
    },
  },
  handler: async (request, response, context) => {
    const {manifestId, installUrlOrBundleUrl, displayMode} = request.params;
    await context.installPWA({
      manifestId,
      installUrlOrBundleUrl,
      displayMode,
    });
    response.appendResponseLine(
      `Installed PWA with manifest ID: ${manifestId}`,
    );
    if (displayMode) {
      response.appendResponseLine(`Display mode set to: ${displayMode}`);
    }
  },
});

export const uninstallPwa = defineTool({
  name: 'uninstall_pwa',
  description:
    'Uninstalls a Progressive Web App identified by its manifest ID and ' +
    'closes any open app windows.',
  annotations: {
    category: ToolCategory.PWA,
    readOnlyHint: false,
  },
  schema: {
    manifestId: manifestIdSchema,
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async (request, response, context) => {
    const {manifestId} = request.params;
    await context.uninstallPWA({manifestId});
    response.appendResponseLine(
      `Uninstalled PWA with manifest ID: ${manifestId}`,
    );
    response.setIncludePages(true);
  },
});

export const launchPwa = defineTool({
  name: 'launch_pwa',
  description:
    'Launches an installed Progressive Web App using its saved display mode. ' +
    'Optionally opens a specific URL within the same app instead of the default ' +
    'start URL.',
  annotations: {
    category: ToolCategory.PWA,
    readOnlyHint: false,
  },
  schema: {
    manifestId: manifestIdSchema,
    url: zod
      .string()
      .optional()
      .describe(
        'Optional URL within the app to open instead of the default start URL.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async (request, response, context) => {
    const {manifestId, url} = request.params;
    const page = await context.launchPWA({manifestId, url});
    response.appendResponseLine(
      `Launched PWA with manifest ID: ${manifestId} (${page.url()})`,
    );
    response.setIncludePages(true);
  },
});

export const getOsAppState = defineTool({
  name: 'get_os_app_state',
  description:
    'Returns the OS integration state (badge count and registered file ' +
    'handlers) for an installed web app, identified by its manifest ID.',
  annotations: {
    category: ToolCategory.PWA,
    readOnlyHint: true,
  },
  schema: {
    manifestId: manifestIdSchema,
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async (request, response, context) => {
    const {manifestId} = request.params;
    const state = await context.getPWAState({manifestId});
    response.appendResponseLine(`OS app state for manifest ID: ${manifestId}`);
    response.appendResponseLine(`Badge count: ${state.badgeCount}`);
    response.appendResponseLine(
      `File handlers: ${JSON.stringify(state.fileHandlers)}`,
    );
  },
});
