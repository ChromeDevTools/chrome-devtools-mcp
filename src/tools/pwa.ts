/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {fileURLToPath} from 'node:url';

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import type {Context} from './ToolDefinition.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Returns the browser-level Puppeteer {@link Browser} for the current session.
 * The PWA APIs are browser-scoped (they wrap the `PWA.*` CDP domain, which
 * operates on the browser target rather than any single page target).
 */
function getBrowser(context: Context) {
  return context.getSelectedMcpPage().pptrPage.browser();
}

function ensureNoNetworkRestrictions(context: Context): void {
  if (context.hasNetworkRestrictions()) {
    throw new Error(
      'PWA install and launch operations are not supported when URL restrictions are configured.',
    );
  }
}

const manifestIdSchema = zod
  .string()
  .describe(
    'The manifest ID of the web app, commonly the start URL of the site ' +
      '(e.g. "https://example.com/"). See https://web.dev/learn/pwa/web-app-manifest.',
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
    'This drives the same install flow as the omnibox install button via the ' +
    'PWA CDP domain, without requiring a manual user gesture. This operation ' +
    'is unavailable when URL restrictions are configured.',
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
  verifyFilesSchema: [],
  handler: async (request, response, context) => {
    const {manifestId, installUrlOrBundleUrl, displayMode} = request.params;
    ensureNoNetworkRestrictions(context);
    const installUrl = new URL(installUrlOrBundleUrl);
    if (installUrl.protocol === 'file:') {
      await context.validatePath(fileURLToPath(installUrl));
    }
    await getBrowser(context).installPWA({
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
  verifyFilesSchema: [],
  handler: async (request, response, context) => {
    const {manifestId} = request.params;
    await getBrowser(context).uninstallPWA({manifestId});
    response.appendResponseLine(
      `Uninstalled PWA with manifest ID: ${manifestId}`,
    );
    response.setIncludePages(true);
  },
});

export const launchPwa = defineTool({
  name: 'launch_pwa',
  description:
    'Launches an installed Progressive Web App in its own app window. ' +
    'Optionally opens a specific URL within the same app instead of the ' +
    'default start URL. This operation is unavailable when URL restrictions ' +
    'are configured.',
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
  verifyFilesSchema: [],
  handler: async (request, response, context) => {
    const {manifestId, url} = request.params;
    ensureNoNetworkRestrictions(context);
    const page = await getBrowser(context).launchPWA({manifestId, url});
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
  verifyFilesSchema: [],
  handler: async (request, response, context) => {
    const {manifestId} = request.params;
    const state = await getBrowser(context).getPWAState({manifestId});
    response.appendResponseLine(`OS app state for manifest ID: ${manifestId}`);
    response.appendResponseLine(`Badge count: ${state.badgeCount}`);
    response.appendResponseLine(
      `File handlers: ${JSON.stringify(state.fileHandlers)}`,
    );
  },
});

export const installCurrentPageAsPwa = defineTool({
  name: 'install_current_page_as_pwa',
  description:
    'Installs the currently selected page as a Progressive Web App. Reads the ' +
    "page's web app manifest, derives the manifest ID automatically, and " +
    'installs it via the PWA CDP domain. Use install_pwa directly if you ' +
    'already know the manifest ID. This operation is unavailable when URL ' +
    'restrictions are configured.',
  annotations: {
    category: ToolCategory.PWA,
    readOnlyHint: false,
  },
  schema: {
    displayMode: displayModeSchema,
  },
  blockedByDialog: false,
  verifyFilesSchema: [],
  handler: async (request, response, context) => {
    const {displayMode} = request.params;
    ensureNoNetworkRestrictions(context);
    const page = context.getSelectedMcpPage().pptrPage;
    const session = await page.createCDPSession();
    const appManifest = await (async () => {
      try {
        return await session.send('Page.getAppManifest');
      } finally {
        await session.detach();
      }
    })();
    const manifestId = appManifest.manifest.id ?? appManifest.manifest.startUrl;
    if (!manifestId) {
      const errors = appManifest.errors.map(error => {
        return error.message;
      });
      throw new Error(
        errors.join('; ') ||
          'Could not derive a manifest id for the current page.',
      );
    }
    await page.browser().installPWA({
      manifestId,
      installUrlOrBundleUrl: page.url(),
      displayMode,
    });
    response.appendResponseLine(
      `Installed current page as PWA${
        appManifest.manifest.name ? ` ("${appManifest.manifest.name}")` : ''
      }.`,
    );
    response.appendResponseLine(`Manifest ID: ${manifestId}`);
    if (displayMode) {
      response.appendResponseLine(`Display mode set to: ${displayMode}`);
    }
    response.setIncludePages(true);
  },
});
