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
// Essential User-Facing Tools (3 tools only)
// ========================================

export const listExtensions = defineTool({
  name: 'list_extensions',
  description: `List all installed Chrome extensions with their status, version, and ability to reload or debug them.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();

    await context.waitForEventsAfterAction(async () => {
      await page.goto('chrome://extensions/', {waitUntil: 'networkidle0'});

      const extensions = await page.evaluate(() => {
        const extensionCards = document.querySelectorAll('extensions-item');
        const results: Array<{
          id: string;
          name: string;
          enabled: boolean;
          version: string;
          description: string;
          hasErrors: boolean;
        }> = [];

        Array.from(extensionCards).forEach(card => {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() ||
              'Unknown';
            const description =
              shadowRoot.querySelector('#description')?.textContent?.trim() ||
              '';
            const version =
              shadowRoot.querySelector('#version')?.textContent?.trim() || '';
            const enabled = !shadowRoot
              .querySelector('#enable-toggle')
              ?.hasAttribute('disabled');
            const id = card.getAttribute('id') || 'unknown';
            const errorsBadge = shadowRoot.querySelector(
              '#errors-button .badge',
            );
            const hasErrors = errorsBadge ? parseInt(errorsBadge.textContent?.trim() || '0') > 0 : false;

            results.push({
              id,
              name,
              enabled,
              version,
              description,
              hasErrors,
            });
          }
        });

        return results;
      });

      response.appendResponseLine('Installed Chrome Extensions:');
      response.appendResponseLine('');

      if (extensions.length === 0) {
        response.appendResponseLine('No extensions found.');
      } else {
        extensions.forEach((ext, index) => {
          response.appendResponseLine(`${index + 1}. **${ext.name}** v${ext.version}`);
          response.appendResponseLine(`   ID: ${ext.id}`);
          response.appendResponseLine(
            `   Status: ${ext.enabled ? '✅ Enabled' : '❌ Disabled'}${ext.hasErrors ? ' ⚠️ Has errors' : ''}`,
          );
          if (ext.description) {
            response.appendResponseLine(`   ${ext.description}`);
          }
          response.appendResponseLine('');
        });
        response.appendResponseLine('💡 Use `reload_extension` to reload or `inspect_service_worker` to debug');
      }
    });
  },
});

export const reloadExtension = defineTool({
  name: 'reload_extension',
  description: `Reload a Chrome extension to apply changes during development.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionName: z
      .string()
      .describe('The name or partial name of the extension to reload'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {extensionName} = request.params;

    await context.waitForEventsAfterAction(async () => {
      await page.goto('chrome://extensions/', {waitUntil: 'networkidle0'});

      const reloadResult = await page.evaluate((searchName: string) => {
        const extensionCards = document.querySelectorAll('extensions-item');

        for (const card of Array.from(extensionCards)) {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() || '';

            if (name.toLowerCase().includes(searchName.toLowerCase())) {
              const reloadButton = shadowRoot.querySelector('#reload-button');
              if (reloadButton && !reloadButton.hasAttribute('hidden')) {
                (reloadButton as HTMLElement).click();
                return {success: true, extensionName: name};
              } else {
                return {
                  success: false,
                  reason:
                    'Reload button not available (extension not in developer mode)',
                };
              }
            }
          }
        }

        return {success: false, reason: 'Extension not found'};
      }, extensionName);

      if (reloadResult.success) {
        response.appendResponseLine(
          `✅ Reloaded: ${reloadResult.extensionName}`,
        );
      } else {
        response.appendResponseLine(
          `❌ Failed: ${reloadResult.reason}`,
        );
      }
    });
  },
});

export const inspectServiceWorker = defineTool({
  name: 'inspect_service_worker',
  description: `Open DevTools for an extension's service worker to debug background scripts.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionName: z
      .string()
      .describe('The name or partial name of the extension to debug'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {extensionName} = request.params;

    await context.waitForEventsAfterAction(async () => {
      await page.goto('chrome://extensions/', {waitUntil: 'networkidle0'});

      const inspectResult = await page.evaluate((searchName: string) => {
        const extensionCards = document.querySelectorAll('extensions-item');

        for (const card of Array.from(extensionCards)) {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() || '';

            if (name.toLowerCase().includes(searchName.toLowerCase())) {
              // Look for service worker link
              const serviceWorkerLink = shadowRoot.querySelector(
                'a[href*="service_worker"]',
              );
              if (serviceWorkerLink) {
                (serviceWorkerLink as HTMLElement).click();
                return {
                  success: true,
                  extensionName: name,
                  type: 'service_worker',
                };
              }

              // Look for background page link
              const backgroundLink = shadowRoot.querySelector(
                'a[href*="background"]',
              );
              if (backgroundLink) {
                (backgroundLink as HTMLElement).click();
                return {
                  success: true,
                  extensionName: name,
                  type: 'background_page',
                };
              }

              return {
                success: false,
                reason: 'No service worker or background page found',
              };
            }
          }
        }

        return {success: false, reason: 'Extension not found'};
      }, extensionName);

      if (inspectResult.success) {
        response.appendResponseLine(
          `✅ Opened DevTools for ${inspectResult.type} of: ${inspectResult.extensionName}`,
        );
      } else {
        response.appendResponseLine(
          `❌ Failed: ${inspectResult.reason}`,
        );
      }
    });
  },
});