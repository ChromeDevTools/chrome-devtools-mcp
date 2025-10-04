/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Defines the categories for the available tools.
 * @public
 */
export enum ToolCategories {
  /**
   * Tools for automating user input, such as clicking and typing.
   */
  INPUT_AUTOMATION = 'Input automation',
  /**
   * Tools for controlling browser navigation.
   */
  NAVIGATION_AUTOMATION = 'Navigation automation',
  /**
   * Tools for emulating different environments, such as network conditions or
   * device metrics.
   */
  EMULATION = 'Emulation',
  /**
   * Tools for measuring and analyzing performance.
   */
  PERFORMANCE = 'Performance',
  /**
   * Tools for inspecting and manipulating network activity.
   */
  NETWORK = 'Network',
  /**
   * Tools for debugging and inspecting the page.
   */
  DEBUGGING = 'Debugging',
}
