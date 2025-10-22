/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod, PredefinedNetworkConditions} from '../third_party/index.js';
import { KnownDevices } from 'puppeteer-core';
import { ToolCategories } from './categories.js';
import { defineTool } from './ToolDefinition.js';

const throttlingOptions: [string, ...string[]] = [
  'No emulation',
  'Offline',
  ...Object.keys(PredefinedNetworkConditions),
];

/**
 * Get all mobile device list (dynamically from KnownDevices)
 * Filter out landscape devices and uncommon devices, keep only common portrait mobile devices
 */
function getMobileDeviceList(): string[] {
  const allDevices = Object.keys(KnownDevices);
  // Filter out landscape devices (containing 'landscape') and some uncommon devices
  const mobileDevices = allDevices.filter(device => {
    const lowerDevice = device.toLowerCase();
    // Exclude landscape devices
    if (lowerDevice.includes('landscape')) return false;
    // Exclude tablets (optional, but keep iPad as common device)
    // if (lowerDevice.includes('ipad') || lowerDevice.includes('tab')) return false;
    // Exclude some old or uncommon devices
    if (lowerDevice.includes('blackberry')) return false;
    if (lowerDevice.includes('lumia')) return false;
    if (lowerDevice.includes('nokia')) return false;
    if (lowerDevice.includes('kindle')) return false;
    if (lowerDevice.includes('jio')) return false;
    if (lowerDevice.includes('optimus')) return false;
    return true;
  });
  
  return mobileDevices;
}

/**
 * Get default mobile device
 */
function getDefaultMobileDevice(): string {
  return 'iPhone 8';
}

/**
 * Validate if device exists in KnownDevices
 */
function validateDeviceExists(device: string): boolean {
  return device in KnownDevices;
}

export const emulateNetwork = defineTool({
  name: 'emulate_network',
  description: `Emulates network conditions such as throttling or offline mode on the selected page.`,
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    throttlingOption: zod
      .enum(throttlingOptions)
      .describe(
        `The network throttling option to emulate. Available throttling options are: ${throttlingOptions.join(', ')}. Set to "No emulation" to disable. Set to "Offline" to simulate offline network conditions.`,
      ),
  },
  handler: async (request, _response, context) => {
    const page = context.getSelectedPage();
    const conditions = request.params.throttlingOption;

    if (conditions === 'No emulation') {
      await page.emulateNetworkConditions(null);
      context.setNetworkConditions(null);
      return;
    }

    if (conditions === 'Offline') {
      await page.emulateNetworkConditions({
        offline: true,
        download: 0,
        upload: 0,
        latency: 0,
      });
      context.setNetworkConditions('Offline');
      return;
    }

    if (conditions in PredefinedNetworkConditions) {
      const networkCondition =
        PredefinedNetworkConditions[
        conditions as keyof typeof PredefinedNetworkConditions
        ];
      await page.emulateNetworkConditions(networkCondition);
      context.setNetworkConditions(conditions);
    }
  },
});

export const emulateCpu = defineTool({
  name: 'emulate_cpu',
  description: `Emulates CPU throttling by slowing down the selected page's execution.`,
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    throttlingRate: zod
      .number()
      .min(1)
      .max(20)
      .describe(
        'The CPU throttling rate representing the slowdown factor 1-20x. Set the rate to 1 to disable throttling',
      ),
  },
  handler: async (request, _response, context) => {
    const page = context.getSelectedPage();
    const { throttlingRate } = request.params;

    await page.emulateCPUThrottling(throttlingRate);
    context.setCpuThrottlingRate(throttlingRate);
  },
});

export const emulateDevice = defineTool({
  name: 'emulate_device',
  description: `IMPORTANT: Emulates a mobile device including viewport, user-agent, touch support, and device scale factor. This tool MUST be called BEFORE navigating to any website to ensure the correct mobile user-agent is used. Essential for testing mobile website performance and user experience. If no device is specified, defaults to iPhone 8.`,
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    device: zod
      .string()
      .optional()
      .describe(
        `The mobile device to emulate. If not specified, defaults to "${getDefaultMobileDevice()}". Available devices include all mobile devices from Puppeteer's KnownDevices (e.g., iPhone 8, iPhone 13, iPhone 14, iPhone 15, Galaxy S8, Galaxy S9+, Pixel 2-5, iPad, iPad Pro, etc.). Use the exact device name as defined in Puppeteer.`,
      ),
    customUserAgent: zod
      .string()
      .optional()
      .describe(
        'Optional custom user agent string. If provided, it will override the device\'s default user agent.',
      ),
  },
  handler: async (request, response, context) => {
    let { device, customUserAgent } = request.params;

    // ========== Phase 0: Handle default device ==========
    // If user didn't specify device, use default mobile device
    if (!device) {
      device = getDefaultMobileDevice();
    }

    // ========== Phase 1: Device validation ==========
    // Validate if device exists in KnownDevices
    if (!validateDeviceExists(device)) {
      const availableDevices = getMobileDeviceList();
      device = availableDevices[0];
    }

    // ========== Phase 2: Page collection and state check ==========
    await context.createPagesSnapshot();
    const allPages = context.getPages();
    const currentPage = context.getSelectedPage();

    // Filter out closed pages
    const activePages = allPages.filter(page => !page.isClosed());
    if (activePages.length === 0) {
      response.appendResponseLine('❌ Error: No active pages available for device emulation.');
      return;
    }

    // ========== Phase 3: Determine pages to emulate ==========
    let pagesToEmulate = [currentPage];

    if (activePages.length > 1) {
      // Check if other pages have navigated content
      const navigatedPages = [];
      for (const page of activePages) {
        if (page.isClosed()) continue; // Double check
        
        try {
          const url = page.url();
          if (url !== 'about:blank' && url !== currentPage.url()) {
            navigatedPages.push({ page, url });
          }
        } catch (error) {
          // Page may have been closed during check
          continue;
        }
      }

      // Set emulation for all pages
      if (navigatedPages.length > 0) {
        pagesToEmulate = [currentPage, ...navigatedPages.map(p => p.page)];
      }
    }

    // Filter again to ensure all pages to emulate are active
    pagesToEmulate = pagesToEmulate.filter(page => !page.isClosed());
    
    if (pagesToEmulate.length === 0) {
      response.appendResponseLine('❌ Error: All target pages have been closed.');
      return;
    }


    // ========== Phase 4: Mobile device emulation ==========
    const deviceConfig = KnownDevices[device as keyof typeof KnownDevices];

    let successCount = 0;
    const failedPages: Array<{ url: string; reason: string }> = [];

    for (const pageToEmulate of pagesToEmulate) {
      if (pageToEmulate.isClosed()) {
        failedPages.push({
          url: 'unknown',
          reason: 'Page closed'
        });
        continue;
      }

      const pageUrl = pageToEmulate.url();

      try {
        // Directly apply device emulation
        await pageToEmulate.emulate({
          userAgent: customUserAgent || deviceConfig.userAgent,
          viewport: deviceConfig.viewport,
        });
        successCount++;
      } catch (error) {
        failedPages.push({
          url: pageUrl,
          reason: (error as Error).message
        });
      }
    }

    // ========== Phase 5: Save state and report results ==========
    if (successCount > 0) {
      context.setDeviceEmulation(device);
    }

    // Build detailed report
    if (successCount > 0) {
      response.appendResponseLine(
        `✅ Successfully emulated device: ${device}, applied to ${successCount} page(s).\n` +
        `Viewport: ${deviceConfig.viewport.width}x${deviceConfig.viewport.height}, ` +
        `Scale: ${deviceConfig.viewport.deviceScaleFactor}x, ` +
        `Mobile: ${deviceConfig.viewport.isMobile ? 'Yes' : 'No'}, ` +
        `Touch: ${deviceConfig.viewport.hasTouch ? 'Yes' : 'No'}${customUserAgent ? ', Custom UA applied' : ''}.`
      );
    } else {
      // Complete failure
      response.appendResponseLine(
        `❌ Error: Unable to apply device emulation to any page.\n\n` +
        `Failure details:\n${failedPages.map(p => `  - ${p.url}: ${p.reason}`).join('\n')}\n\n` +
        `Diagnostic suggestions:\n` +
        `  1. Confirm all target pages are in active state\n` +
        `  2. Check if pages allow device emulation (some internal pages may restrict it)\n` +
        `  3. Try closing other pages and keep only one page\n` +
        `  4. Restart browser and retry`
      );
    }
  },
});
