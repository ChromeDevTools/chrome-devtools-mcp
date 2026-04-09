/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import {zod, PredefinedNetworkConditions} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  definePageTool,
  geolocationTransform,
  viewportTransform,
} from './ToolDefinition.js';

const throttlingOptions: [string, ...string[]] = [
  'Offline',
  ...Object.keys(PredefinedNetworkConditions),
];

export const emulate = definePageTool({
  name: 'emulate',
  description: `Emulate features on page.`,
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    networkConditions: zod
      .enum(throttlingOptions)
      .optional()
      .describe(`Throttle network. Omit to disable.`),
    cpuThrottlingRate: zod
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe('CPU slowdown factor. 1 to disable.'),
    geolocation: zod
      .string()
      .optional()
      .transform(geolocationTransform)
      .describe('Geolocation (<lat>x<lon>). Lat: -90 to 90. Lon: -180 to 180.'),
    userAgent: zod
      .string()
      .optional()
      .describe('User agent to emulate. Empty string to clear.'),
    colorScheme: zod
      .enum(['dark', 'light', 'auto'])
      .optional()
      .describe('Emulate dark or light mode. "auto" to reset.'),
    viewport: zod
      .string()
      .optional()
      .transform(viewportTransform)
      .describe(`Viewport spec: '<w>x<h>x<dpr>[,mobile][,touch][,landscape]'.`),
  },
  handler: async (request, _response, context) => {
    const page = request.page;
    await context.emulate(request.params, page.pptrPage);
  },
});
