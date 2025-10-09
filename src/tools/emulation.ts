/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PredefinedNetworkConditions } from 'puppeteer-core';
import { KnownDevices } from 'puppeteer-core';
import z from 'zod';

import { ToolCategories } from './categories.js';
import { defineTool } from './ToolDefinition.js';

const throttlingOptions: [string, ...string[]] = [
  'No emulation',
  ...Object.keys(PredefinedNetworkConditions),
];

// common use device
const deviceOptions: [string, ...string[]] = [
  'No emulation',
  // iPhone series
  'iPhone SE',
  'iPhone 12',
  'iPhone 12 Pro',
  'iPhone 13',
  'iPhone 13 Pro',
  'iPhone 14',
  'iPhone 14 Pro',
  'iPhone 15',
  'iPhone 15 Pro',
  // Android series
  'Galaxy S5',
  'Galaxy S8',
  'Galaxy S9+',
  'Pixel 2',
  'Pixel 3',
  'Pixel 4',
  'Pixel 5',
  'Nexus 5',
  'Nexus 6P',
  // ipad
  'iPad',
  'iPad Pro',
  'Galaxy Tab S4',
];

export const emulateNetwork = defineTool({
  name: 'emulate_network',
  description: `Emulates network conditions such as throttling on the selected page.`,
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    throttlingOption: z
      .enum(throttlingOptions)
      .describe(
        `The network throttling option to emulate. Available throttling options are: ${throttlingOptions.join(', ')}. Set to "No emulation" to disable.`,
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
    throttlingRate: z
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
  description: `IMPORTANT: Emulates a mobile device including viewport, user-agent, touch support, and device scale factor. This tool MUST be called BEFORE navigating to any website to ensure the correct mobile user-agent is used. Essential for testing mobile website performance and user experience.`,
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    device: z
      .enum(deviceOptions)
      .describe(
        `The device to emulate. Available devices are: ${deviceOptions.join(', ')}. Set to "No emulation" to disable device emulation and use desktop mode.`,
      ),
    customUserAgent: z
      .string()
      .optional()
      .describe(
        'Optional custom user agent string. If provided, it will override the device\'s default user agent.',
      ),
  },
  handler: async (request, response, context) => {
    const { device, customUserAgent } = request.params;

    // get all pages to support multi-page scene 
    await context.createPagesSnapshot();
    const allPages = context.getPages();
    const currentPage = context.getSelectedPage();

    // check if multi pages and apply to all pages
    let pagesToEmulate = [currentPage];
    let multiPageMessage = '';

    if (allPages.length > 1) {
      // check if other pages have navigated content (maybe new tab page)
      const navigatedPages = [];
      for (const page of allPages) {
        const url = page.url();
        if (url !== 'about:blank' && url !== currentPage.url()) {
          navigatedPages.push({ page, url });
        }
      }

      if (navigatedPages.length > 0) {
        // found other pages have navigated, apply device emulation to all pages
        pagesToEmulate = [currentPage, ...navigatedPages.map(p => p.page)];
        multiPageMessage = `🔄 SMART MULTI-PAGE MODE: Detected ${navigatedPages.length} additional page(s) with content. ` +
          `Applying device emulation to current page and ${navigatedPages.length} other page(s): ` +
          `${navigatedPages.map(p => p.url).join(', ')}. `;
      }
    }

    // check if current page has navigated
    const currentUrl = currentPage.url();
    if (currentUrl !== 'about:blank') {
      response.appendResponseLine(
        `⚠️  WARNING: Device emulation is being applied AFTER page navigation (current URL: ${currentUrl}). ` +
        `For best results, device emulation should be set BEFORE navigating to the target website.`
      );
    }

    if (multiPageMessage) {
      response.appendResponseLine(multiPageMessage);
    }

    if (device === 'No emulation') {
      // apply desktop mode to all pages
      for (const pageToEmulate of pagesToEmulate) {
        await pageToEmulate.setViewport({
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
          isLandscape: true,
        });

        await pageToEmulate.setUserAgent(
          customUserAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        );
      }

      response.appendResponseLine(
        `Device emulation disabled. Desktop mode applied to ${pagesToEmulate.length} page(s).`
      );
      return;
    }

    // check if current device is in KnownDevices
    if (device in KnownDevices) {
      const deviceConfig = KnownDevices[device as keyof typeof KnownDevices];

      // apply device config to all page
      for (const pageToEmulate of pagesToEmulate) {
        await pageToEmulate.emulate({
          userAgent: customUserAgent || deviceConfig.userAgent,
          viewport: deviceConfig.viewport,
        });
      }

      response.appendResponseLine(
        `Successfully emulated device: ${device} on ${pagesToEmulate.length} page(s). ` +
        `Viewport: ${deviceConfig.viewport.width}x${deviceConfig.viewport.height}, ` +
        `Scale: ${deviceConfig.viewport.deviceScaleFactor}x, ` +
        `Mobile: ${deviceConfig.viewport.isMobile ? 'Yes' : 'No'}, ` +
        `Touch: ${deviceConfig.viewport.hasTouch ? 'Yes' : 'No'}${customUserAgent ? ', Custom UA applied' : ''}.`
      );
    } else {
      response.appendResponseLine(
        `Device "${device}" not found in known devices. Available devices: ${deviceOptions.filter(d => d !== 'No emulation').join(', ')}`
      );
    }
  },
});
