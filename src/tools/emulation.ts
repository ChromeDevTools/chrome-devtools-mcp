/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {PredefinedNetworkConditions} from 'puppeteer-core';
import type {CDPSession, Protocol, Viewport} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const throttlingOptions: [string, ...string[]] = [
  'No emulation',
  ...Object.keys(PredefinedNetworkConditions),
];

const deviceProfileOptions = ['iPhone-12-Pro', 'Pixel-7'] as const;

type DeviceProfileName = (typeof deviceProfileOptions)[number];

interface DeviceProfileDefinition {
  metrics: Protocol.Emulation.SetDeviceMetricsOverrideRequest;
  touch: Protocol.Emulation.SetTouchEmulationEnabledRequest;
  userAgent: Protocol.Network.SetUserAgentOverrideRequest;
  viewport: Viewport;
  locale?: string;
  timezoneId?: string;
}

const DEVICE_PROFILES: Record<DeviceProfileName, DeviceProfileDefinition> = {
  'iPhone-12-Pro': {
    metrics: {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
      screenOrientation: {
        type: 'portraitPrimary',
        angle: 0,
      },
      positionX: 0,
      positionY: 0,
      scale: 1,
    },
    touch: {
      enabled: true,
      maxTouchPoints: 5,
    },
    viewport: {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      isLandscape: false,
    },
    userAgent: {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      acceptLanguage: 'en-US,en',
    },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  },
  'Pixel-7': {
    metrics: {
      width: 412,
      height: 915,
      deviceScaleFactor: 2.625,
      mobile: true,
      screenWidth: 412,
      screenHeight: 915,
      screenOrientation: {
        type: 'portraitPrimary',
        angle: 0,
      },
      positionX: 0,
      positionY: 0,
      scale: 1,
    },
    touch: {
      enabled: true,
      maxTouchPoints: 5,
    },
    viewport: {
      width: 412,
      height: 915,
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      isLandscape: false,
    },
    userAgent: {
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TD1A.221105.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      platform: 'Android',
      acceptLanguage: 'en-US,en',
    },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  },
};

function getClient(page: unknown): CDPSession {
  return (page as { _client(): CDPSession })._client();
}

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
    const {throttlingRate} = request.params;

    await page.emulateCPUThrottling(throttlingRate);
    context.setCpuThrottlingRate(throttlingRate);
  },
});

export const emulateDeviceProfile = defineTool({
  name: 'emulate_device_profile',
  description:
    'Emulates a device profile by applying predefined viewport metrics, touch, user agent, locale, and timezone settings.',
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    profile: z
      .enum(deviceProfileOptions)
      .describe(
        `The device profile preset to apply. Supported profiles: ${deviceProfileOptions.join(', ')}.`,
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const profileName = request.params.profile;
    const profile = DEVICE_PROFILES[profileName];

    if (!profile) {
      throw new Error(`Unknown device profile: ${profileName}`);
    }

    const client = getClient(page);

    await client.send('Emulation.setDeviceMetricsOverride', profile.metrics);
    await client.send('Network.setUserAgentOverride', profile.userAgent);

    if (profile.locale) {
      await client.send('Emulation.setLocaleOverride', {
        locale: profile.locale,
      });
    }

    if (profile.timezoneId) {
      await client.send('Emulation.setTimezoneOverride', {
        timezoneId: profile.timezoneId,
      });
    }

    await page.setViewport(profile.viewport);

    await client.send('Emulation.setTouchEmulationEnabled', profile.touch);

    response.appendResponseLine(
      `Applied device profile "${profileName}" to the selected page.`,
    );
  },
});
