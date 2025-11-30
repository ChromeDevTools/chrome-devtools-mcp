/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ========================================
// Chrome Extension Development Tools
// ========================================
//
// These tools use CDP (Chrome DevTools Protocol) and direct URL access
// to interact with extensions. Tools that relied on chrome://extensions
// Shadow DOM scraping have been removed as they are unreliable due to
// Chrome's security restrictions.
//
// Working tools:
// - openExtensionPopup: Uses page.goto('chrome-extension://ID/popup.html')
// - closeExtensionPopup: URL validation only
// - inspectIframePopup: CDP frame attachment
// - patchIframePopup: File I/O + CDP reload
// - reloadIframeExtension: CDP + chrome.runtime.reload()
// ========================================

export const openExtensionPopup = defineTool({
  name: 'open_extension_popup',
  description: `Select an already-opened Chrome extension popup window for testing. If no extension name is provided, it will automatically detect and select the currently active popup window. If an extension name is provided, it will search for that specific extension's popup. After selection, you can use take_snapshot, click, evaluate_script, etc. on the popup.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionName: z
      .string()
      .optional()
      .describe('(Optional) The name or partial name of the extension. If omitted, will use the currently active popup.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {extensionName} = request.params;

    await context.waitForEventsAfterAction(async () => {
      const browser = page.browser();
      if (!browser) {
        response.appendResponseLine('❌ Failed to get browser instance.');
        return;
      }

      // If no extension name provided, check if current page is already a popup
      if (!extensionName) {
        const currentUrl = page.url();
        if (currentUrl.startsWith('chrome-extension://')) {
          response.appendResponseLine('✅ Already on an extension popup window');
          response.appendResponseLine(`📄 Popup URL: ${currentUrl}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            '💡 You can now use take_snapshot, click, evaluate_script, etc. on the popup',
          );
          return;
        }

        // Check for iframe-embedded popup in current page
        const iframePopups = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('iframe'))
            .filter((iframe) => iframe.src.startsWith('chrome-extension://'))
            .map((iframe) => ({
              src: iframe.src,
              id: iframe.id,
              className: iframe.className,
            }));
        });

        if (iframePopups.length > 0) {
          response.appendResponseLine(
            '✅ Extension popup found (embedded as iframe)',
          );
          response.appendResponseLine(`📄 Popup URL: ${iframePopups[0].src}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            '💡 This popup is embedded in the current page as an iframe.',
          );
          response.appendResponseLine(
            '   You can interact with it using regular page tools:',
          );
          response.appendResponseLine('   - take_snapshot (includes iframe content)');
          response.appendResponseLine('   - click on elements');
          response.appendResponseLine('   - fill forms');
          response.appendResponseLine('   - evaluate_script');
          return;
        }

        // If not on popup or iframe, try to find any open popup window
        const pages = await browser.pages();
        for (let i = 0; i < pages.length; i++) {
          const p = pages[i];
          const url = p.url();
          if (url.startsWith('chrome-extension://')) {
            context.setSelectedPageIdx(i);
            response.appendResponseLine('✅ Found and selected open popup window');
            response.appendResponseLine(`📄 Popup URL: ${url}`);
            response.appendResponseLine('');
            response.appendResponseLine(
              '💡 You can now use take_snapshot, click, evaluate_script, etc. on the popup',
            );
            return;
          }
        }

        response.appendResponseLine('❌ No extension popup window found.');
        response.appendResponseLine(
          '💡 Please manually click the extension icon to open the popup first.',
        );
        return;
      }

      // If extensionName is provided, search for popup containing that name in URL
      // This uses URL-based detection, not chrome://extensions Shadow DOM
      response.appendResponseLine(`🔍 Searching for popup matching: "${extensionName}"`);

      const pages = await browser.pages();
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const url = p.url();
        if (url.startsWith('chrome-extension://') &&
            url.toLowerCase().includes(extensionName.toLowerCase())) {
          context.setSelectedPageIdx(i);
          response.appendResponseLine('✅ Found and selected matching popup window');
          response.appendResponseLine(`📄 Popup URL: ${url}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            '💡 You can now use take_snapshot, click, evaluate_script, etc. on the popup',
          );
          return;
        }
      }

      // Check for any extension popup if exact match not found
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const url = p.url();
        if (url.startsWith('chrome-extension://')) {
          context.setSelectedPageIdx(i);
          response.appendResponseLine(`⚠️ No popup matching "${extensionName}" found, but found another extension popup`);
          response.appendResponseLine(`📄 Popup URL: ${url}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            '💡 You can now use take_snapshot, click, evaluate_script, etc. on the popup',
          );
          return;
        }
      }

      response.appendResponseLine(`❌ No extension popup found matching: "${extensionName}"`);
      response.appendResponseLine(
        '💡 Please manually click the extension icon to open the popup first.',
      );
    });
  },
});

export const closeExtensionPopup = defineTool({
  name: 'close_extension_popup',
  description: `Close the currently selected extension popup page.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();
    const url = page.url();

    if (!url.startsWith('chrome-extension://')) {
      response.appendResponseLine(
        '❌ Current page is not an extension popup',
      );
      response.appendResponseLine(`Current URL: ${url}`);
      return;
    }

    try {
      await page.close();
      response.appendResponseLine('✅ Extension popup closed');
    } catch (error) {
      response.appendResponseLine(
        `❌ Failed to close popup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// Import iframe popup tools
import * as iframePopupTools from './iframe-popup-tools.js';

export const inspectIframePopup = defineTool({
  name: 'inspect_iframe_popup',
  description: `Inspect an iframe-embedded extension popup using CDP. This tool can access iframe content that normal Puppeteer cannot reach. Returns the full HTML of the iframe popup.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: true,
  },
  schema: {
    urlPattern: z
      .string()
      .describe(
        'Regular expression pattern to match the iframe URL (e.g., "chrome-extension://[^/]+/popup\\.html$")',
      ),
    waitMs: z
      .number()
      .optional()
      .describe('Maximum time to wait for iframe (default: 5000ms)'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {urlPattern, waitMs} = request.params;

    await context.waitForEventsAfterAction(async () => {
      try {
        const cdp = await page.createCDPSession();
        const pattern = new RegExp(urlPattern);
        const result = await iframePopupTools.inspectIframe(
          cdp,
          pattern,
          waitMs ?? 5000,
        );

        response.appendResponseLine('✅ Successfully inspected iframe popup');
        response.appendResponseLine('');
        response.appendResponseLine(`📄 Frame URL: ${result.frameUrl}`);
        response.appendResponseLine(`🆔 Frame ID: ${result.frameId}`);
        response.appendResponseLine('');
        response.appendResponseLine('📝 HTML Content:');
        response.appendResponseLine('```html');
        response.appendResponseLine(
          result.html.length > 2000
            ? result.html.substring(0, 2000) + '\n... (truncated)'
            : result.html,
        );
        response.appendResponseLine('```');

        await cdp.detach();
      } catch (error) {
        response.appendResponseLine(
          `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});

export const patchIframePopup = defineTool({
  name: 'patch_iframe_popup',
  description: `Patch local extension source files and reload the extension. This allows live editing of iframe-embedded popups. The extension must be loaded from a local directory.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionPath: z
      .string()
      .describe('Absolute path to the extension directory'),
    patches: z
      .array(
        z.object({
          file: z
            .string()
            .describe('Relative path to file within extension (e.g., "popup.html")'),
          find: z
            .string()
            .describe('Regular expression pattern to find'),
          replace: z.string().describe('Replacement string'),
        }),
      )
      .describe('Array of patches to apply'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {extensionPath, patches} = request.params;

    await context.waitForEventsAfterAction(async () => {
      try {
        const cdp = await page.createCDPSession();

        response.appendResponseLine(
          `🔧 Applying ${patches.length} patch(es) to extension...`,
        );

        await iframePopupTools.patchAndReload(cdp, extensionPath, patches);

        response.appendResponseLine('');
        response.appendResponseLine('✅ Patches applied successfully');
        response.appendResponseLine('🔄 Extension reloaded');
        response.appendResponseLine('');
        response.appendResponseLine('Applied patches:');
        for (const p of patches) {
          response.appendResponseLine(
            `  • ${p.file}: "${p.find}" → "${p.replace}"`,
          );
        }

        await cdp.detach();
      } catch (error) {
        response.appendResponseLine(
          `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});

export const reloadIframeExtension = defineTool({
  name: 'reload_iframe_extension',
  description: `Reload the extension via its service worker using chrome.runtime.reload(). Useful after manually editing extension files.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    await context.waitForEventsAfterAction(async () => {
      try {
        const cdp = await page.createCDPSession();

        response.appendResponseLine('🔄 Reloading extension...');

        await iframePopupTools.reloadExtension(cdp);

        response.appendResponseLine('');
        response.appendResponseLine('✅ Extension reloaded successfully');

        await cdp.detach();
      } catch (error) {
        response.appendResponseLine(
          `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});
