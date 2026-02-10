/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import {zod, PredefinedNetworkConditions} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import type {Context} from './ToolDefinition.js';
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
      .describe(
        'Geolocation to emulate. Set to null to clear the geolocation override.',
      ),
    userAgent: zod
      .string()
      .nullable()
      .optional()
      .describe(
        'User agent to emulate. Set to null to clear the user agent override.',
      ),
    colorScheme: zod
      .enum(['dark', 'light', 'auto'])
      .optional()
      .describe(
        'Emulate the dark or the light mode. Set to "auto" to reset to the default.',
      ),
    viewport: zod
      .object({
        width: zod.number().int().min(0).describe('Page width in pixels.'),
        height: zod.number().int().min(0).describe('Page height in pixels.'),
        deviceScaleFactor: zod
          .number()
          .min(0)
          .optional()
          .describe('Specify device scale factor (can be thought of as dpr).'),
        isMobile: zod
          .boolean()
          .optional()
          .describe(
            'Whether the meta viewport tag is taken into account. Defaults to false.',
          ),
        hasTouch: zod
          .boolean()
          .optional()
          .describe(
            'Specifies if viewport supports touch events. This should be set to true for mobile devices.',
          ),
        isLandscape: zod
          .boolean()
          .optional()
          .describe(
            'Specifies if viewport is in landscape mode. Defaults to false.',
          ),
      })
      .nullable()
      .optional()
      .describe(
        'Viewport to emulate. Set to null to reset to the default viewport.',
      ),
  },
  handler: async (request, _response, context) => {
    const page = context.getSelectedPage();
    const {
      networkConditions,
      cpuThrottlingRate,
      geolocation,
      userAgent,
      viewport,
    } = request.params;

    if (networkConditions) {
      if (networkConditions === 'No emulation') {
        await page.emulateNetworkConditions(null);
        context.setNetworkConditions(null);
      } else if (networkConditions === 'Offline') {
        await page.emulateNetworkConditions({
          offline: true,
          download: 0,
          upload: 0,
          latency: 0,
        });
        context.setNetworkConditions('Offline');
      } else if (networkConditions in PredefinedNetworkConditions) {
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

    if (geolocation !== undefined) {
      if (geolocation === null) {
        await page.setGeolocation({latitude: 0, longitude: 0});
        context.setGeolocation(null);
      } else {
        await page.setGeolocation(geolocation);
        context.setGeolocation(geolocation);
      }
    }

    if (userAgent !== undefined) {
      if (userAgent === null) {
        await page.setUserAgent({
          userAgent: undefined,
        });
        context.setUserAgent(null);
      } else {
        await page.setUserAgent({
          userAgent,
        });
        context.setUserAgent(userAgent);
      }
    }

    if (request.params.colorScheme) {
      if (request.params.colorScheme === 'auto') {
        await page.emulateMediaFeatures([
          {name: 'prefers-color-scheme', value: ''},
        ]);
        context.setColorScheme(null);
      } else {
        await page.emulateMediaFeatures([
          {
            name: 'prefers-color-scheme',
            value: request.params.colorScheme,
          },
        ]);
        context.setColorScheme(request.params.colorScheme);
      }
    }

    if (viewport !== undefined) {
      if (viewport === null) {
        await page.setViewport(null);
        context.setViewport(null);
      } else {
        const defaults = {
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
          isLandscape: false,
        };
        await page.setViewport({...defaults, ...viewport});
        context.setViewport({...defaults, ...viewport});
      }
    }
  },
});

// For ui settings
const emulationSchema = {
  networkConditions: zod
    .string()
    .optional()
    .describe('Network conditions to emulate.'),
  cpuThrottlingRate: zod
    .number()
    .optional()
    .describe('CPU throttling rate to emulate.'),
};

async function applyEmulation(
  params: zod.objectOutputType<typeof emulationSchema, zod.ZodTypeAny>,
  context: Context,
) {
  const page = context.getSelectedPage();
  const {networkConditions, cpuThrottlingRate} = params;

  if (networkConditions) {
    if (networkConditions === 'No emulation') {
      await page.emulateNetworkConditions(null);
      context.setNetworkConditions(null);
    } else if (networkConditions === 'Offline') {
      await page.emulateNetworkConditions({
        offline: true,
        download: 0,
        upload: 0,
        latency: 0,
      });
      context.setNetworkConditions('Offline');
    } else if (networkConditions in PredefinedNetworkConditions) {
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
}

export const pickEmulationSettings = defineTool({
  name: 'pick_emulation_settings',
  description: `Activates the emulation configuration module for the current session and reveals the control interface.
Note: This tool is a prerequisite for custom network/CPU throttling during traces.
CRITICAL: Execution of this tool MUST be followed IMMEDIATELY by the next operational tool (e.g., performance_start_trace or page_navigate) in the same execution turn. 
DO NOT respond to the user, DO NOT pause for interaction, and DO NOT wait for confirmation. The module remains active in the background.`,
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  _meta: {
    ui: {
      resourceUri: 'ui://emulation/throttling',
      visibility: ['model', 'app'],
    },
  },
  schema: {},
  handler: async (_request, response, _context) => {
    response.appendResponseLine('EMULATION_MODULE_ACTIVE. Interface revealed to user.');
  },
});

// Used for the ui to set the emulation parameters
export const emulateSetParameters = defineTool({
  name: 'emulate_set_parameters',
  description: `Sets emulation parameters (network throttling, CPU slowdown) on the selected page without opening a UI.`,
  annotations: {
    category: 'UI' as unknown as ToolCategory,
    readOnlyHint: false,
  },
  _meta: {
    ui: {
      visibility: ['app'],
    },
  },
  schema: emulationSchema,
  handler: async (request, response, context) => {
    await applyEmulation(request.params, context);
    response.appendResponseLine('EMULATION_SETTINGS_APPLIED');
  },
});

