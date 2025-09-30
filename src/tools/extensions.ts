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
        const manager = document.querySelector('extensions-manager');
        if (!manager?.shadowRoot) return null;
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList?.shadowRoot) return null;
        const extensionCards = itemList.shadowRoot.querySelectorAll('extensions-item');
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
            let enableToggle = shadowRoot.querySelector('#enable-toggle');
            if (!enableToggle) {
              enableToggle = shadowRoot.querySelector('cr-toggle');
            }
            const enabled = enableToggle?.getAttribute('checked') === '';
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

      if (!extensions) {
        response.appendResponseLine('❌ Failed to query extensions page');
        return;
      }

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

export const getExtensionInfo = defineTool({
  name: 'get_extension_info',
  description: `Get detailed information about a specific Chrome extension including its current state, version, and any errors.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: true,
  },
  schema: {
    extensionName: z
      .string()
      .describe('The name or partial name of the extension to get info about'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {extensionName} = request.params;

    await context.waitForEventsAfterAction(async () => {
      await page.goto('chrome://extensions/', {waitUntil: 'networkidle0'});

      const extensionInfo = await page.evaluate((searchName: string) => {
        const manager = document.querySelector('extensions-manager');
        if (!manager?.shadowRoot) return null;
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList?.shadowRoot) return null;
        const extensionCards = itemList.shadowRoot.querySelectorAll('extensions-item');

        for (const card of Array.from(extensionCards)) {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() || '';

            if (name.toLowerCase().includes(searchName.toLowerCase())) {
              const description =
                shadowRoot.querySelector('#description')?.textContent?.trim() ||
                '';
              const version =
                shadowRoot.querySelector('#version')?.textContent?.trim() || '';
              let enableToggle = shadowRoot.querySelector('#enable-toggle');
              if (!enableToggle) {
                enableToggle = shadowRoot.querySelector('cr-toggle');
              }
              const enabled = enableToggle?.getAttribute('checked') === '';
              const id = card.getAttribute('id') || 'unknown';
              const errorsBadge = shadowRoot.querySelector(
                '#errors-button .badge',
              );
              const hasErrors = errorsBadge
                ? parseInt(errorsBadge.textContent?.trim() || '0') > 0
                : false;

              // Get error details if available
              const errors: string[] = [];
              if (hasErrors) {
                const errorsButton = shadowRoot.querySelector('#errors-button');
                if (errorsButton) {
                  // Try to get error text from the errors section
                  const errorsList = shadowRoot.querySelectorAll(
                    '.error-list .error-message',
                  );
                  errorsList.forEach(err => {
                    const errorText = err.textContent?.trim();
                    if (errorText) {
                      errors.push(errorText);
                    }
                  });
                }
              }

              // Check if this is a development extension
              const detailsView = shadowRoot.querySelector('extensions-detail-view');
              const isDevelopment = detailsView ?
                detailsView.shadowRoot?.querySelector('#load-path')?.textContent?.trim() : undefined;

              return {
                found: true,
                id,
                name,
                version,
                description,
                enabled,
                hasErrors,
                errors,
                path: isDevelopment || 'Not a development extension',
              };
            }
          }
        }

        return {found: false};
      }, extensionName);

      if (!extensionInfo) {
        response.appendResponseLine('❌ Failed to query extensions page');
        return;
      }

      if (extensionInfo.found) {
        response.appendResponseLine(`## Extension: ${extensionInfo.name}`);
        response.appendResponseLine('');
        response.appendResponseLine(`**ID:** ${extensionInfo.id}`);
        response.appendResponseLine(`**Version:** ${extensionInfo.version}`);
        response.appendResponseLine(
          `**Status:** ${extensionInfo.enabled ? '✅ Enabled' : '❌ Disabled'}`,
        );
        if (extensionInfo.description) {
          response.appendResponseLine(
            `**Description:** ${extensionInfo.description}`,
          );
        }
        if (extensionInfo.path !== 'Not a development extension') {
          response.appendResponseLine(`**Path:** ${extensionInfo.path}`);
        }
        response.appendResponseLine('');

        if (extensionInfo.hasErrors) {
          response.appendResponseLine('⚠️ **Errors:**');
          if (extensionInfo.errors.length > 0) {
            extensionInfo.errors.forEach(err => {
              response.appendResponseLine(`  - ${err}`);
            });
          } else {
            response.appendResponseLine('  Extension has errors (details not available)');
          }
        } else {
          response.appendResponseLine('✅ No errors detected');
        }
      } else {
        response.appendResponseLine(
          `❌ Extension not found: "${extensionName}"`,
        );
        response.appendResponseLine('');
        response.appendResponseLine('💡 Use `list_extensions` to see all installed extensions');
      }
    });
  },
});

export const reloadExtension = defineTool({
  name: 'reload_extension',
  description: `Reload a Chrome extension to apply changes during development. Checks extension state before and after reload.`,
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

      // Get extension info before reload
      const beforeState = await page.evaluate((searchName: string) => {
        const manager = document.querySelector('extensions-manager');
        if (!manager?.shadowRoot) return null;
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList?.shadowRoot) return null;
        const extensionCards = itemList.shadowRoot.querySelectorAll('extensions-item');

        for (const card of Array.from(extensionCards)) {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() || '';

            if (name.toLowerCase().includes(searchName.toLowerCase())) {
              const version =
                shadowRoot.querySelector('#version')?.textContent?.trim() || '';
              let enableToggle = shadowRoot.querySelector('#enable-toggle');
              if (!enableToggle) {
                enableToggle = shadowRoot.querySelector('cr-toggle');
              }
              const enabled = enableToggle?.getAttribute('checked') === '';
              const id = card.getAttribute('id') || 'unknown';

              return {
                found: true,
                id,
                name,
                version,
                enabled,
              };
            }
          }
        }

        return {found: false};
      }, extensionName);

      if (!beforeState) {
        response.appendResponseLine('❌ Failed to query extensions page');
        return;
      }

      if (!beforeState.found) {
        response.appendResponseLine(
          `❌ Extension not found: "${extensionName}"`,
        );
        return;
      }

      if (!beforeState.enabled) {
        response.appendResponseLine(
          `⚠️ Warning: Extension "${beforeState.name}" is currently disabled`,
        );
      }

      response.appendResponseLine(
        `🔄 Reloading: ${beforeState.name} v${beforeState.version}`,
      );

      // Perform reload
      const reloadResult = await page.evaluate((searchName: string) => {
        const manager = document.querySelector('extensions-manager');
        if (!manager?.shadowRoot) return null;
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList?.shadowRoot) return null;
        const extensionCards = itemList.shadowRoot.querySelectorAll('extensions-item');

        for (const card of Array.from(extensionCards)) {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() || '';

            if (name.toLowerCase().includes(searchName.toLowerCase())) {
              // Try multiple selectors for reload button
              let reloadButton = shadowRoot.querySelector('#reload-button');
              if (!reloadButton) {
                reloadButton = shadowRoot.querySelector('cr-icon-button[id="reload-button"]');
              }
              if (!reloadButton) {
                // Try finding by aria-label or title
                reloadButton = shadowRoot.querySelector('[aria-label*="Reload"]');
              }

              if (reloadButton && !reloadButton.hasAttribute('hidden')) {
                (reloadButton as HTMLElement).click();
                return {success: true};
              } else {
                return {
                  success: false,
                  reason:
                    'Reload button not available (extension not in developer mode or button hidden)',
                };
              }
            }
          }
        }

        return {success: false, reason: 'Extension not found'};
      }, extensionName);

      if (!reloadResult) {
        response.appendResponseLine('❌ Failed to execute reload');
        return;
      }

      if (!reloadResult.success) {
        response.appendResponseLine(`❌ Failed: ${reloadResult.reason}`);
        return;
      }

      // Wait for reload to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check for errors after reload
      const afterState = await page.evaluate((searchName: string) => {
        const manager = document.querySelector('extensions-manager');
        if (!manager?.shadowRoot) return null;
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList?.shadowRoot) return null;
        const extensionCards = itemList.shadowRoot.querySelectorAll('extensions-item');

        for (const card of Array.from(extensionCards)) {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() || '';

            if (name.toLowerCase().includes(searchName.toLowerCase())) {
              const version =
                shadowRoot.querySelector('#version')?.textContent?.trim() || '';
              const errorsBadge = shadowRoot.querySelector(
                '#errors-button .badge',
              );
              const hasErrors = errorsBadge
                ? parseInt(errorsBadge.textContent?.trim() || '0') > 0
                : false;

              return {
                found: true,
                version,
                hasErrors,
              };
            }
          }
        }

        return {found: false, hasErrors: false};
      }, extensionName);

      if (!afterState) {
        response.appendResponseLine('⚠️ Warning: Could not verify reload status');
        return;
      }

      response.appendResponseLine('');
      if (afterState.hasErrors) {
        response.appendResponseLine(
          `⚠️ Extension reloaded but has errors (v${afterState.version})`,
        );
        response.appendResponseLine(
          '💡 Use `get_extension_info` to see error details',
        );
      } else {
        response.appendResponseLine(
          `✅ Successfully reloaded: ${beforeState.name} v${afterState.version}`,
        );
      }
    });
  },
});

export const toggleExtensionState = defineTool({
  name: 'toggle_extension_state',
  description: `Safely enable or disable a Chrome extension. Always checks current state before toggling to prevent accidental changes.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionName: z
      .string()
      .describe('The name or partial name of the extension'),
    state: z
      .enum(['enable', 'disable'])
      .describe('Desired state: "enable" or "disable"'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {extensionName, state} = request.params;
    const desiredEnabled = state === 'enable';

    await context.waitForEventsAfterAction(async () => {
      await page.goto('chrome://extensions/', {waitUntil: 'networkidle0'});

      const result = await page.evaluate(
        (searchName: string, targetEnabled: boolean) => {
          const manager = document.querySelector('extensions-manager');
        if (!manager?.shadowRoot) return null;
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList?.shadowRoot) return null;
        const extensionCards = itemList.shadowRoot.querySelectorAll('extensions-item');

          for (const card of Array.from(extensionCards)) {
            const shadowRoot = card.shadowRoot;
            if (shadowRoot) {
              const name =
                shadowRoot.querySelector('#name')?.textContent?.trim() || '';

              if (name.toLowerCase().includes(searchName.toLowerCase())) {
                // Try both selectors: #enable-toggle (older Chrome) and cr-toggle (newer Chrome)
                let enableToggle = shadowRoot.querySelector('#enable-toggle');
                if (!enableToggle) {
                  enableToggle = shadowRoot.querySelector('cr-toggle');
                }

                const currentEnabled =
                  enableToggle?.getAttribute('checked') === '';

                // Check if already in desired state
                if (currentEnabled === targetEnabled) {
                  return {
                    success: true,
                    alreadyInState: true,
                    extensionName: name,
                    currentState: currentEnabled,
                  };
                }

                // Toggle the state
                if (enableToggle) {
                  (enableToggle as HTMLElement).click();
                  return {
                    success: true,
                    alreadyInState: false,
                    extensionName: name,
                    previousState: currentEnabled,
                    newState: targetEnabled,
                  };
                } else {
                  return {
                    success: false,
                    reason: 'Enable/disable toggle not found (tried #enable-toggle and cr-toggle)',
                  };
                }
              }
            }
          }

          return {success: false, reason: 'Extension not found'};
        },
        extensionName,
        desiredEnabled,
      );

      if (!result) {
        response.appendResponseLine('❌ Failed to query extensions page');
        return;
      }

      if (!result.success) {
        response.appendResponseLine(`❌ Failed: ${result.reason}`);
        return;
      }

      if (result.alreadyInState) {
        response.appendResponseLine(
          `ℹ️ Extension "${result.extensionName}" is already ${result.currentState ? 'enabled' : 'disabled'}`,
        );
      } else {
        response.appendResponseLine(
          `✅ ${result.extensionName}: ${result.previousState ? 'Enabled' : 'Disabled'} → ${result.newState ? 'Enabled' : 'Disabled'}`,
        );
      }
    });
  },
});

export const openExtensionPopup = defineTool({
  name: 'open_extension_popup',
  description: `Open a Chrome extension's popup in a testable context. The popup will be opened as a page that can be interacted with using standard tools like take_snapshot, click, and evaluate_script.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionName: z
      .string()
      .describe('The name or partial name of the extension'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {extensionName} = request.params;

    await context.waitForEventsAfterAction(async () => {
      // First, get extension ID
      await page.goto('chrome://extensions/', {waitUntil: 'networkidle0'});

      const extensionInfo = await page.evaluate((searchName: string) => {
        const manager = document.querySelector('extensions-manager');
        if (!manager?.shadowRoot) return null;
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList?.shadowRoot) return null;
        const extensionCards = itemList.shadowRoot.querySelectorAll('extensions-item');

        for (const card of Array.from(extensionCards)) {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() || '';

            if (name.toLowerCase().includes(searchName.toLowerCase())) {
              const id = card.getAttribute('id') || '';
              return {found: true, id, name};
            }
          }
        }

        return {found: false};
      }, extensionName);

      if (!extensionInfo) {
        response.appendResponseLine('❌ Failed to query extensions page');
        return;
      }

      if (!extensionInfo.found) {
        response.appendResponseLine(
          `❌ Extension not found: "${extensionName}"`,
        );
        return;
      }

      response.appendResponseLine(
        `🔍 Found extension: ${extensionInfo.name} (${extensionInfo.id})`,
      );

      try {
        // Find service worker target
        const browser = page.browser();
        if (!browser) {
          response.appendResponseLine('❌ Failed to get browser instance.');
          return;
        }

        const targets = await browser.targets();

        const workerTarget = targets.find(
          (target: any) =>
            target.type() === 'service_worker' &&
            target.url().includes(extensionInfo.id),
        );

        if (!workerTarget) {
          response.appendResponseLine(
            '❌ Service worker not found. Extension may not have a service worker (MV2 extensions are not supported).',
          );
          return;
        }

        const worker = await workerTarget.worker();
        if (!worker) {
          response.appendResponseLine(
            '❌ Failed to get service worker context.',
          );
          return;
        }

        response.appendResponseLine('🔧 Opening popup via service worker...');

        // Open popup
        await worker.evaluate('chrome.action.openPopup();');

        // Wait for popup target
        const popupTarget = await browser.waitForTarget(
          (target: any) =>
            target.type() === 'page' &&
            target.url().includes(extensionInfo.id) &&
            target.url().includes('popup'),
          {timeout: 5000},
        );

        if (!popupTarget) {
          response.appendResponseLine(
            '❌ Popup did not open within timeout.',
          );
          return;
        }

        const popupPage = await popupTarget.page();
        if (!popupPage) {
          response.appendResponseLine(
            '❌ Failed to get popup page reference.',
          );
          return;
        }

        // Add popup page to context and select it
        const pages = await browser.pages();
        const popupIndex = pages.indexOf(popupPage);

        if (popupIndex !== -1) {
          context.setSelectedPageIdx(popupIndex);
          response.appendResponseLine('');
          response.appendResponseLine(
            `✅ Popup opened: ${extensionInfo.name}`,
          );
          response.appendResponseLine(`📄 Popup URL: ${popupPage.url()}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            '💡 You can now use take_snapshot, click, evaluate_script, etc. on the popup',
          );
        } else {
          response.appendResponseLine(
            '⚠️ Popup opened but could not be selected automatically.',
          );
        }
      } catch (error) {
        response.appendResponseLine(
          `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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
        const manager = document.querySelector('extensions-manager');
        if (!manager?.shadowRoot) return null;
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList?.shadowRoot) return null;
        const extensionCards = itemList.shadowRoot.querySelectorAll('extensions-item');

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

      if (!inspectResult) {
        response.appendResponseLine('❌ Failed to find extension');
        return;
      }

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