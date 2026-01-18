/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import * as iframePopupTools from './iframe-popup-tools.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Consolidated extension popup tool.
 * Combines: open_extension_popup, close_extension_popup
 */
export const extensionPopup = defineTool({
  name: 'extension_popup',
  description: 'Open or close extension popup window.',
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    op: z.enum(['open', 'close']).describe('Operation'),
    extensionName: z.string().optional().describe('Extension name filter'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {op, extensionName} = request.params;

    await context.waitForEventsAfterAction(async () => {
      const browser = page.browser();
      if (!browser) {
        response.appendResponseLine('Failed to get browser instance');
        return;
      }

      if (op === 'close') {
        const url = page.url();
        if (!url.startsWith('chrome-extension://')) {
          response.appendResponseLine('Current page is not an extension popup');
          response.appendResponseLine(`URL: ${url}`);
          return;
        }
        try {
          await page.close();
          response.appendResponseLine('Popup closed');
        } catch (error) {
          response.appendResponseLine(
            `Failed to close: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return;
      }

      // op === 'open'
      if (!extensionName) {
        const currentUrl = page.url();
        if (currentUrl.startsWith('chrome-extension://')) {
          response.appendResponseLine('Already on extension popup');
          response.appendResponseLine(`URL: ${currentUrl}`);
          return;
        }

        // Check for iframe-embedded popup
        const iframePopups = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('iframe'))
            .filter(iframe => iframe.src.startsWith('chrome-extension://'))
            .map(iframe => ({src: iframe.src}));
        });

        if (iframePopups.length > 0) {
          response.appendResponseLine('Popup found (iframe)');
          response.appendResponseLine(`URL: ${iframePopups[0].src}`);
          return;
        }

        // Find any open popup window
        const pages = await browser.pages();
        for (let i = 0; i < pages.length; i++) {
          const url = pages[i].url();
          if (url.startsWith('chrome-extension://')) {
            context.setSelectedPageIdx(i);
            response.appendResponseLine('Popup window selected');
            response.appendResponseLine(`URL: ${url}`);
            return;
          }
        }

        response.appendResponseLine(
          'No popup found. Click extension icon to open.',
        );
        return;
      }

      // Search for popup matching extensionName
      response.appendResponseLine(`Searching: "${extensionName}"`);

      const pages = await browser.pages();
      for (let i = 0; i < pages.length; i++) {
        const url = pages[i].url();
        if (
          url.startsWith('chrome-extension://') &&
          url.toLowerCase().includes(extensionName.toLowerCase())
        ) {
          context.setSelectedPageIdx(i);
          response.appendResponseLine('Matching popup selected');
          response.appendResponseLine(`URL: ${url}`);
          return;
        }
      }

      // Fallback to any extension popup
      for (let i = 0; i < pages.length; i++) {
        const url = pages[i].url();
        if (url.startsWith('chrome-extension://')) {
          context.setSelectedPageIdx(i);
          response.appendResponseLine(`No exact match, using: ${url}`);
          return;
        }
      }

      response.appendResponseLine(`No popup found: "${extensionName}"`);
    });
  },
});

/**
 * Consolidated iframe popup tool.
 * Combines: inspect_iframe_popup, patch_iframe_popup, reload_iframe_extension
 */
export const iframePopup = defineTool({
  name: 'iframe_popup',
  description: 'Iframe popup: inspect, patch, or reload extension.',
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    op: z.enum(['inspect', 'patch', 'reload']).describe('Operation'),
    urlPattern: z.string().optional().describe('URL regex (for inspect)'),
    waitMs: z.number().optional().describe('Wait timeout ms'),
    extensionPath: z
      .string()
      .optional()
      .describe('Extension dir path (for patch)'),
    patches: z
      .array(
        z.object({
          file: z.string().describe('File path'),
          find: z.string().describe('Regex pattern'),
          replace: z.string().describe('Replacement'),
        }),
      )
      .optional()
      .describe('Patches array (for patch)'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {op, urlPattern, waitMs, extensionPath, patches} = request.params;

    await context.waitForEventsAfterAction(async () => {
      try {
        const cdp = await page.createCDPSession();

        switch (op) {
          case 'inspect': {
            if (!urlPattern) {
              throw new Error('urlPattern required for inspect');
            }
            const pattern = new RegExp(urlPattern);
            const result = await iframePopupTools.inspectIframe(
              cdp,
              pattern,
              waitMs ?? 5000,
            );

            response.appendResponseLine('Iframe inspected');
            response.appendResponseLine(`URL: ${result.frameUrl}`);
            response.appendResponseLine(`Frame ID: ${result.frameId}`);
            response.appendResponseLine('HTML:');
            response.appendResponseLine(
              result.html.length > 2000
                ? result.html.substring(0, 2000) + '... (truncated)'
                : result.html,
            );
            break;
          }

          case 'patch': {
            if (!extensionPath || !patches) {
              throw new Error('extensionPath and patches required for patch');
            }
            response.appendResponseLine(
              `Applying ${patches.length} patch(es)...`,
            );
            await iframePopupTools.patchAndReload(cdp, extensionPath, patches);
            response.appendResponseLine('Patches applied, extension reloaded');
            for (const p of patches) {
              response.appendResponseLine(
                `  ${p.file}: "${p.find}" -> "${p.replace}"`,
              );
            }
            break;
          }

          case 'reload': {
            response.appendResponseLine('Reloading extension...');
            await iframePopupTools.reloadExtension(cdp);
            response.appendResponseLine('Extension reloaded');
            break;
          }
        }

        await cdp.detach();
      } catch (error) {
        response.appendResponseLine(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});
