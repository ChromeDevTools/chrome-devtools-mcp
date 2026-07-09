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

function headerStringTransform(
  value: string | undefined,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === '') {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('Headers must be a JSON object');
    }
    return parsed as Record<string, string>;
  } catch (error) {
    throw new Error(
      `Invalid JSON for headers: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const throttlingOptions: [string, ...string[]] = [
  'Offline',
  ...Object.keys(PredefinedNetworkConditions),
];

export const emulate = definePageTool({
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
      .describe(`Throttle network. Omit to disable throttling.`),
    cpuThrottlingRate: zod
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe(
        'Represents the CPU slowdown factor. Omit or set the rate to 1 to disable throttling',
      ),
    geolocation: zod
      .string()
      .optional()
      .transform(geolocationTransform)
      .describe(
        'Geolocation (`<latitude>,<longitude>`) to emulate. Latitude between -90 and 90. Longitude between -180 and 180. Omit to clear the geolocation override.',
      ),
    userAgent: zod
      .string()
      .optional()
      .describe(
        'User agent to emulate. Set to empty string to clear the user agent override.',
      ),
    colorScheme: zod
      .enum(['dark', 'light', 'auto'])
      .optional()
      .describe(
        'Emulate the dark or the light mode. Set to "auto" to reset to the default.',
      ),
    viewport: zod
      .string()
      .optional()
      .transform(viewportTransform)
      .describe(
        `Emulate device viewports '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]'. 'touch' and 'mobile' to emulate mobile devices. 'landscape' to emulate landscape mode.`,
      ),
    extraHttpHeaders: zod
      .string()
      .optional()
      .transform(headerStringTransform)
      .describe(
        'Extra HTTP headers as a JSON string object, e.g. {"X-Custom": "value", "Authorization": "Bearer token"}. Headers are included into every HTTP request originating from the page and persist across navigations until cleared. Pass an empty string to clear all extra headers.',
      ),
  },
  blockedByDialog: true,
  verifyFilesSchema: [],
  handler: async (request, response, context) => {
    const page = request.page;
    await context.emulate(request.params, page);
    response.appendResponseLine('Emulation configured successfully');
  },
});
