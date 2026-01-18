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
  ...Object.keys(PredefinedNetworkConditions),
];

/**
 * Consolidated emulation tool.
 * Combines: emulate_network, emulate_cpu
 */
export const emulate = defineTool({
  name: 'emulate',
  description: 'Emulate CPU or network throttling.',
  annotations: {
    category: ToolCategories.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    target: z.enum(['cpu', 'network']).describe('Emulation target'),
    throttlingRate: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe('CPU rate 1-20x'),
    throttlingOption: z
      .enum(throttlingOptions)
      .optional()
      .describe('Network option'),
  },
  handler: async (request, response, context) => {
    const {target, throttlingRate, throttlingOption} = request.params;
    const page = context.getSelectedPage();

    if (target === 'cpu') {
      if (throttlingRate === undefined) {
        throw new Error('throttlingRate required for cpu');
      }
      await page.emulateCPUThrottling(throttlingRate);
      context.setCpuThrottlingRate(throttlingRate);
      response.appendResponseLine(`CPU throttling set to ${throttlingRate}x`);
    } else {
      if (!throttlingOption) {
        throw new Error('throttlingOption required for network');
      }

      if (throttlingOption === 'No emulation') {
        await page.emulateNetworkConditions(null);
        context.setNetworkConditions(null);
        response.appendResponseLine('Network emulation disabled');
        return;
      }

      if (throttlingOption in PredefinedNetworkConditions) {
        const condition =
          PredefinedNetworkConditions[
            throttlingOption as keyof typeof PredefinedNetworkConditions
          ];
        await page.emulateNetworkConditions(condition);
        context.setNetworkConditions(throttlingOption);
        response.appendResponseLine(`Network set to ${throttlingOption}`);
      }
    }
  },
});
