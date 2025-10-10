/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {PredefinedNetworkConditions} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const throttlingOptions: [string, ...string[]] = [
  'No emulation',
  'Offline',
  ...Object.keys(PredefinedNetworkConditions),
];

export const emulateNetwork = defineTool({
  name: 'emulate_network',
  description: `Emulates network conditions such as throttling or offline mode on the selected page.`,
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    throttlingOption: z
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
