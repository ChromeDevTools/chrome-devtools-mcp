/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const navigateExtensionsPage = defineTool({
  name: 'navigate_extensions_page',
  description: `Navigate to the Chrome extensions management page (chrome://extensions/) to view and manage installed extensions.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();
    await context.waitForEventsAfterAction(async () => {
      await page.goto('chrome://extensions/', {waitUntil: 'networkidle0'});
      response.appendResponseLine('Navigated to Chrome Extensions page');
      response.appendResponseLine(
        'You can now see all installed extensions, their status, and manage them.',
      );
    });
  },
});

export const listExtensions = defineTool({
  name: 'list_extensions',
  description: `Get a list of all installed Chrome extensions with their status, ID, name, and enabled state.`,
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

            results.push({
              id,
              name,
              enabled,
              version,
              description,
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
          response.appendResponseLine(`${index + 1}. **${ext.name}**`);
          response.appendResponseLine(`   - ID: ${ext.id}`);
          response.appendResponseLine(`   - Version: ${ext.version}`);
          response.appendResponseLine(
            `   - Status: ${ext.enabled ? '✅ Enabled' : '❌ Disabled'}`,
          );
          response.appendResponseLine(`   - Description: ${ext.description}`);
          response.appendResponseLine('');
        });
      }
    });
  },
});

export const reloadExtension = defineTool({
  name: 'reload_extension',
  description: `Reload a specific Chrome extension by its name or partial name match. Useful for applying changes during development.`,
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
                    'Reload button not available or extension not in developer mode',
                };
              }
            }
          }
        }

        return {success: false, reason: 'Extension not found'};
      }, extensionName);

      if (reloadResult.success) {
        response.appendResponseLine(
          `✅ Successfully reloaded extension: ${reloadResult.extensionName}`,
        );
      } else {
        response.appendResponseLine(
          `❌ Failed to reload extension "${extensionName}": ${reloadResult.reason}`,
        );
      }
    });
  },
});

export const getExtensionErrors = defineTool({
  name: 'get_extension_errors',
  description: `Get error messages and logs for a specific Chrome extension. Helps identify issues during development.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: true,
  },
  schema: {
    extensionName: z
      .string()
      .describe(
        'The name or partial name of the extension to check for errors',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {extensionName} = request.params;

    await context.waitForEventsAfterAction(async () => {
      await page.goto('chrome://extensions/', {waitUntil: 'networkidle0'});

      const errorInfo = await page.evaluate((searchName: string) => {
        const extensionCards = document.querySelectorAll('extensions-item');

        for (const card of Array.from(extensionCards)) {
          const shadowRoot = card.shadowRoot;
          if (shadowRoot) {
            const name =
              shadowRoot.querySelector('#name')?.textContent?.trim() || '';

            if (name.toLowerCase().includes(searchName.toLowerCase())) {
              const errorsButton = shadowRoot.querySelector('#errors-button');
              const errorsBadge = shadowRoot.querySelector(
                '#errors-button .badge',
              );
              const errorCount = errorsBadge?.textContent?.trim() || '0';

              if (errorsButton && !errorsButton.hasAttribute('hidden')) {
                (errorsButton as HTMLElement).click();
                // Note: Detailed error retrieval requires additional interaction
                // For now, we'll return basic error info and suggest manual inspection
              }

              return {
                extensionName: name,
                errorCount: parseInt(errorCount) || 0,
                errors: [],
                hasErrors: parseInt(errorCount) > 0,
              };
            }
          }
        }

        return {
          extensionName: searchName,
          errorCount: 0,
          errors: [],
          hasErrors: false,
          notFound: true,
        };
      }, extensionName);

      if (errorInfo.notFound) {
        response.appendResponseLine(
          `❌ Extension "${extensionName}" not found`,
        );
      } else {
        response.appendResponseLine(
          `Extension: **${errorInfo.extensionName}**`,
        );
        response.appendResponseLine(`Error Count: ${errorInfo.errorCount}`);

        if (errorInfo.hasErrors) {
          response.appendResponseLine('');
          response.appendResponseLine('🚨 **Errors Found:**');
          if (errorInfo.errors.length > 0) {
            errorInfo.errors.forEach((error, index) => {
              response.appendResponseLine(`${index + 1}. ${error}`);
            });
          } else {
            response.appendResponseLine(
              'Click on "Errors" button in the extension card for detailed error information.',
            );
          }
        } else {
          response.appendResponseLine('✅ No errors found for this extension.');
        }
      }
    });
  },
});

export const inspectServiceWorker = defineTool({
  name: 'inspect_service_worker',
  description: `Open DevTools for an extension's service worker (background script). Essential for debugging extension background processes.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionName: z
      .string()
      .describe(
        'The name or partial name of the extension whose service worker to inspect',
      ),
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
          `✅ Opened DevTools for ${inspectResult.type} of extension: ${inspectResult.extensionName}`,
        );
        response.appendResponseLine(
          "You can now debug the extension's background processes, view console logs, and set breakpoints.",
        );
      } else {
        response.appendResponseLine(
          `❌ Failed to inspect service worker for "${extensionName}": ${inspectResult.reason}`,
        );
      }
    });
  },
});

export const getExtensionStorage = defineTool({
  name: 'get_extension_storage',
  description: `Execute JavaScript to read Chrome extension storage (chrome.storage.local or chrome.storage.sync) for debugging purposes.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: true,
  },
  schema: {
    storageType: z
      .enum(['local', 'sync'])
      .default('local')
      .describe('Type of storage to read (local or sync)'),
    keys: z
      .array(z.string())
      .optional()
      .describe('Specific keys to retrieve. If not provided, gets all storage'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {storageType, keys} = request.params;

    await context.waitForEventsAfterAction(async () => {
      try {
        const storageData = await page.evaluate(
          async (type: string, targetKeys?: string[]) => {
            // Check if we're in an extension context
            if (
              typeof (window as any).chrome === 'undefined' ||
              !(window as any).chrome.storage
            ) {
              return {
                error:
                  'chrome.storage API not available. This might not be an extension context.',
              };
            }

            return new Promise(resolve => {
              const chrome = (window as any).chrome;
              const storage =
                type === 'sync' ? chrome.storage.sync : chrome.storage.local;

              if (targetKeys && targetKeys.length > 0) {
                storage.get(targetKeys, (result: any) => {
                  if (chrome.runtime.lastError) {
                    resolve({error: chrome.runtime.lastError.message});
                  } else {
                    resolve({data: result});
                  }
                });
              } else {
                storage.get(null, (result: any) => {
                  if (chrome.runtime.lastError) {
                    resolve({error: chrome.runtime.lastError.message});
                  } else {
                    resolve({data: result});
                  }
                });
              }
            });
          },
          storageType,
          keys,
        );

        response.appendResponseLine(
          `**Chrome Extension Storage (${storageType}):**`,
        );
        response.appendResponseLine('');

        if ((storageData as any).error) {
          response.appendResponseLine(
            `❌ Error: ${(storageData as any).error}`,
          );
          response.appendResponseLine('');
          response.appendResponseLine(
            '💡 **Tip:** Navigate to an extension page (popup, options, etc.) or inspect a service worker to access extension APIs.',
          );
        } else {
          response.appendResponseLine('```json');
          response.appendResponseLine(
            JSON.stringify((storageData as any).data, null, 2),
          );
          response.appendResponseLine('```');
        }
      } catch (error) {
        response.appendResponseLine(
          `❌ Failed to access extension storage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});

export const setExtensionStorage = defineTool({
  name: 'set_extension_storage',
  description: `Execute JavaScript to write data to Chrome extension storage (chrome.storage.local or chrome.storage.sync) for testing purposes.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    storageType: z
      .enum(['local', 'sync'])
      .default('local')
      .describe('Type of storage to write to (local or sync)'),
    data: z
      .record(z.any())
      .describe('Key-value pairs to store in the extension storage'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {storageType, data} = request.params;

    await context.waitForEventsAfterAction(async () => {
      try {
        const result = await page.evaluate(
          async (type: string, storageData: Record<string, any>) => {
            if (
              typeof (window as any).chrome === 'undefined' ||
              !(window as any).chrome.storage
            ) {
              return {
                error:
                  'chrome.storage API not available. This might not be an extension context.',
              };
            }

            return new Promise(resolve => {
              const chrome = (window as any).chrome;
              const storage =
                type === 'sync' ? chrome.storage.sync : chrome.storage.local;

              storage.set(storageData, () => {
                if (chrome.runtime.lastError) {
                  resolve({error: chrome.runtime.lastError.message});
                } else {
                  resolve({success: true});
                }
              });
            });
          },
          storageType,
          data,
        );

        if ((result as any).error) {
          response.appendResponseLine(
            `❌ Error setting extension storage: ${(result as any).error}`,
          );
          response.appendResponseLine('');
          response.appendResponseLine(
            '💡 **Tip:** Navigate to an extension page (popup, options, etc.) or inspect a service worker to access extension APIs.',
          );
        } else {
          response.appendResponseLine(
            `✅ Successfully set data in chrome.storage.${storageType}`,
          );
          response.appendResponseLine('');
          response.appendResponseLine('**Data set:**');
          response.appendResponseLine('```json');
          response.appendResponseLine(JSON.stringify(data, null, 2));
          response.appendResponseLine('```');
        }
      } catch (error) {
        response.appendResponseLine(
          `❌ Failed to set extension storage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});

export const clearExtensionStorage = defineTool({
  name: 'clear_extension_storage',
  description: `Clear all or specific keys from Chrome extension storage (chrome.storage.local or chrome.storage.sync) for testing purposes.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    storageType: z
      .enum(['local', 'sync'])
      .default('local')
      .describe('Type of storage to clear (local or sync)'),
    keys: z
      .array(z.string())
      .optional()
      .describe('Specific keys to remove. If not provided, clears all storage'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const {storageType, keys} = request.params;

    await context.waitForEventsAfterAction(async () => {
      try {
        const result = await page.evaluate(
          async (type: string, targetKeys?: string[]) => {
            if (
              typeof (window as any).chrome === 'undefined' ||
              !(window as any).chrome.storage
            ) {
              return {
                error:
                  'chrome.storage API not available. This might not be an extension context.',
              };
            }

            return new Promise(resolve => {
              const chrome = (window as any).chrome;
              const storage =
                type === 'sync' ? chrome.storage.sync : chrome.storage.local;

              if (targetKeys && targetKeys.length > 0) {
                storage.remove(targetKeys, () => {
                  if (chrome.runtime.lastError) {
                    resolve({error: chrome.runtime.lastError.message});
                  } else {
                    resolve({success: true, cleared: targetKeys});
                  }
                });
              } else {
                storage.clear(() => {
                  if (chrome.runtime.lastError) {
                    resolve({error: chrome.runtime.lastError.message});
                  } else {
                    resolve({success: true, cleared: 'all'});
                  }
                });
              }
            });
          },
          storageType,
          keys,
        );

        if ((result as any).error) {
          response.appendResponseLine(
            `❌ Error clearing extension storage: ${(result as any).error}`,
          );
          response.appendResponseLine('');
          response.appendResponseLine(
            '💡 **Tip:** Navigate to an extension page (popup, options, etc.) or inspect a service worker to access extension APIs.',
          );
        } else {
          if ((result as any).cleared === 'all') {
            response.appendResponseLine(
              `✅ Successfully cleared all data from chrome.storage.${storageType}`,
            );
          } else {
            response.appendResponseLine(
              `✅ Successfully removed keys from chrome.storage.${storageType}: ${Array.isArray((result as any).cleared) ? (result as any).cleared.join(', ') : (result as any).cleared}`,
            );
          }
        }
      } catch (error) {
        response.appendResponseLine(
          `❌ Failed to clear extension storage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});
