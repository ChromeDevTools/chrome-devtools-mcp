/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
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
  description: `Emulates various features.`,
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    networkConditions: zod
      .enum(throttlingOptions)
      .optional()
      .describe(
        `Throttle network. "No emulation" to disable. Omit to keep unchanged.`,
      ),
    cpuThrottlingRate: zod
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe('CPU slowdown factor. 1 to disable. Omit to keep unchanged.'),
    geolocation: zod
      .object({
        latitude: zod
          .number()
          .min(-90)
          .max(90)
          .describe('Latitude between -90 and 90.'),
        longitude: zod
          .number()
          .min(-180)
          .max(180)
          .describe('Longitude between -180 and 180.'),
      })
      .nullable()
      .optional()
      .describe('Geolocation to emulate. null to clear override.'),
    userAgent: zod
      .string()
      .nullable()
      .optional()
      .describe('User agent to emulate. null to clear override.'),
    colorScheme: zod
      .enum(['dark', 'light', 'auto'])
      .optional()
      .describe('Emulate dark or light mode. "auto" to reset.'),
    viewport: zod
      .object({
        width: zod.number().int().min(0).describe('Page width (px).'),
        height: zod.number().int().min(0).describe('Page height (px).'),
        deviceScaleFactor: zod
          .number()
          .min(0)
          .optional()
          .describe('Device scale factor (dpr).'),
        isMobile: zod
          .boolean()
          .optional()
          .describe('Use meta viewport tag. Default: false.'),
        hasTouch: zod
          .boolean()
          .optional()
          .describe('Viewport supports touch. true for mobile.'),
        isLandscape: zod
          .boolean()
          .optional()
          .describe('Landscape mode. Default: false.'),
      })
      .nullable()
      .optional()
      .describe('Viewport to emulate. null to reset.'),
  },
  handler: async (request, _response, context) => {
    await context.emulate(request.params);
  },
});
