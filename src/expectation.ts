/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Token optimization via expectation parameters.
 * Inspired by fast-playwright-mcp.
 */

import {zod} from './third_party/index.js';

/**
 * Schema for snapshot filtering options.
 * Allows limiting snapshot scope for token efficiency.
 */
export const snapshotOptionsSchema = zod
  .object({
    selector: zod
      .string()
      .optional()
      .describe(
        'CSS selector to limit snapshot scope (e.g., ".main-content", "form")',
      ),
    maxLength: zod
      .number()
      .optional()
      .describe('Maximum snapshot characters (truncates if exceeded)'),
    verbose: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include verbose accessibility info'),
  })
  .optional();

/**
 * Schema for image compression options.
 */
export const imageOptionsSchema = zod
  .object({
    quality: zod
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe('JPEG/WebP quality (1-100, lower = smaller)'),
    maxWidth: zod
      .number()
      .optional()
      .describe('Maximum width in pixels (resize if larger)'),
    maxHeight: zod
      .number()
      .optional()
      .describe('Maximum height in pixels (resize if larger)'),
    format: zod
      .enum(['jpeg', 'png', 'webp'])
      .optional()
      .describe('Image format (jpeg for smallest size)'),
  })
  .optional();

/**
 * Schema for expectation configuration that controls response content.
 * All options default to false for maximum token efficiency.
 */
export const expectationSchema = zod
  .object({
    includeSnapshot: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Include accessibility tree snapshot (false saves ~40% tokens)',
      ),
    includeConsole: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include console messages'),
    includeNetwork: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include network requests'),
    includeTabs: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include tab/page information'),
    snapshotOptions: snapshotOptionsSchema,
    imageOptions: imageOptionsSchema,
  })
  .optional();

export type ExpectationOptions = zod.infer<typeof expectationSchema>;
export type SnapshotOptions = zod.infer<typeof snapshotOptionsSchema>;
export type ImageOptions = zod.infer<typeof imageOptionsSchema>;

/**
 * Tool-specific default expectation configurations.
 * These optimize token usage based on typical tool usage patterns.
 * Tool names match chrome-devtools-mcp's actual tool names.
 */
type RequiredExpectationBase = Required<
  Omit<NonNullable<ExpectationOptions>, 'imageOptions' | 'snapshotOptions'>
>;

const TOOL_DEFAULTS: Record<string, RequiredExpectationBase> = {
  // Navigation tools - minimal output by default
  navigate_page: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  new_page: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },

  // Input tools - minimal output
  click: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  click_at: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  fill: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  fill_form: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  hover: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  drag: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  scroll: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  press_key: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  upload_file: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },

  // Screenshot - minimal text, focus on image
  take_screenshot: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },

  // Snapshot tool - must include snapshot
  get_page_content: {
    includeSnapshot: true,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },

  // Console tool - must include console
  get_console_messages: {
    includeSnapshot: false,
    includeConsole: true,
    includeNetwork: false,
    includeTabs: false,
  },

  // Network tool - must include network
  get_network_requests: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: true,
    includeTabs: false,
  },

  // Tab management - include tabs
  list_pages: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: true,
  },
  select_page: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: true,
  },
  close_page: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: true,
  },
  resize_page: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: true,
  },

  // Dialog handling
  handle_dialog: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: true,
  },

  // Script evaluation - minimal output
  evaluate: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  wait_for_text: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },

  // Performance - focused output
  performance_start_trace: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  performance_stop_trace: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },

  // Emulation tools
  set_viewport: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  set_user_agent: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  set_geolocation: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  set_network_conditions: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
  set_cpu_throttling: {
    includeSnapshot: false,
    includeConsole: false,
    includeNetwork: false,
    includeTabs: false,
  },
};

/**
 * General default configuration for tools without specific settings.
 */
const GENERAL_DEFAULT: RequiredExpectationBase = {
  includeSnapshot: false,
  includeConsole: false,
  includeNetwork: false,
  includeTabs: false,
};

/**
 * Get default expectation configuration for a specific tool.
 */
export function getDefaultExpectation(
  toolName: string,
): RequiredExpectationBase {
  return TOOL_DEFAULTS[toolName] ?? GENERAL_DEFAULT;
}

/**
 * Merge user-provided expectation with tool-specific defaults.
 */
export function mergeExpectations(
  toolName: string,
  userExpectation?: ExpectationOptions,
): NonNullable<ExpectationOptions> {
  const defaults = getDefaultExpectation(toolName);
  if (!userExpectation) {
    return defaults;
  }
  return {
    includeSnapshot:
      userExpectation.includeSnapshot ?? defaults.includeSnapshot,
    includeConsole: userExpectation.includeConsole ?? defaults.includeConsole,
    includeNetwork: userExpectation.includeNetwork ?? defaults.includeNetwork,
    includeTabs: userExpectation.includeTabs ?? defaults.includeTabs,
    snapshotOptions: userExpectation.snapshotOptions,
    imageOptions: userExpectation.imageOptions,
  };
}
