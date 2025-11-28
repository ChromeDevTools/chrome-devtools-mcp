/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod, PredefinedNetworkConditions} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const throttlingOptions: [string, ...string[]] = [
  'No emulation',
  'Offline',
  ...Object.keys(PredefinedNetworkConditions),
];

export const emulate = defineTool({
  name: 'emulate',
  description: `Emulates various features on the selected page.`,
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    networkConditions: zod
      .enum(throttlingOptions)
      .optional()
      .describe(
        `Throttle network. Set to "No emulation" to disable. If omitted, conditions remain unchanged.`,
      ),
    cpuThrottlingRate: zod
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe(
        'Represents the CPU slowdown factor. Set the rate to 1 to disable throttling. If omitted, throttling remains unchanged.',
      ),
  },
  handler: async (request, _response, context) => {
    const page = context.getSelectedPage();
    const networkConditions = request.params.networkConditions;
    const cpuThrottlingRate = request.params.cpuThrottlingRate;

    if (networkConditions) {
      if (networkConditions === 'No emulation') {
        await page.emulateNetworkConditions(null);
        context.setNetworkConditions(null);
        return;
      }

      if (networkConditions === 'Offline') {
        await page.emulateNetworkConditions({
          offline: true,
          download: 0,
          upload: 0,
          latency: 0,
        });
        context.setNetworkConditions('Offline');
        return;
      }

      if (networkConditions in PredefinedNetworkConditions) {
        const networkCondition =
          PredefinedNetworkConditions[
            networkConditions as keyof typeof PredefinedNetworkConditions
          ];
        await page.emulateNetworkConditions(networkCondition);
        context.setNetworkConditions(networkConditions);
      }
    }

    if (cpuThrottlingRate) {
      await page.emulateCPUThrottling(cpuThrottlingRate);
      context.setCpuThrottlingRate(cpuThrottlingRate);
    }
  },
});

export const emulateGeolocation = defineTool({
  name: 'emulate_geolocation',
  description: `Emulates geolocation on the selected page. Useful for testing location-based features.`,
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    latitude: zod
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe(
        'Latitude between -90 and 90. Omit latitude and longitude to clear the override.',
      ),
    longitude: zod
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe(
        'Longitude between -180 and 180. Omit latitude and longitude to clear the override.',
      ),
  },
  handler: async (request, _response, context) => {
    const page = context.getSelectedPage();
    const {latitude, longitude} = request.params;

    if (latitude === undefined && longitude === undefined) {
      // Clear geolocation override
      await page.setGeolocation({
        latitude: 0,
        longitude: 0,
      });
      context.setGeolocation(null);
    } else if (latitude !== undefined && longitude !== undefined) {
      // Set geolocation override
      await page.setGeolocation({
        latitude,
        longitude,
      });
      context.setGeolocation({
        latitude,
        longitude,
      });
    } else {
      throw new Error(
        'Both latitude and longitude must be provided, or both must be omitted to clear the override.',
      );
    }
  },
});
