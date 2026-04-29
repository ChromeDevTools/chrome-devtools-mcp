/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ToolCategory {
  INPUT = 'input',
  NAVIGATION = 'navigation',
  EMULATION = 'emulation',
  PERFORMANCE = 'performance',
  NETWORK = 'network',
  DEBUGGING = 'debugging',
  EXTENSIONS = 'extensions',
  '3P_DEVELOPER' = 'experimental3pDeveloper',
  MEMORY = 'memory',
  WEBMCP = 'experimentalWebmcp',
}

export const labels = {
  [ToolCategory.INPUT]: 'Input automation',
  [ToolCategory.NAVIGATION]: 'Navigation automation',
  [ToolCategory.EMULATION]: 'Emulation',
  [ToolCategory.PERFORMANCE]: 'Performance',
  [ToolCategory.NETWORK]: 'Network',
  [ToolCategory.DEBUGGING]: 'Debugging',
  [ToolCategory.EXTENSIONS]: 'Extensions',
  [ToolCategory['3P_DEVELOPER']]: 'Third-party developer tools',
  [ToolCategory.MEMORY]: 'Memory',
  [ToolCategory.WEBMCP]: 'WebMCP',
};

export const OFF_BY_DEFAULT_CATEGORIES = [
  ToolCategory.EXTENSIONS,
  ToolCategory['3P_DEVELOPER'],
  ToolCategory.WEBMCP,
];
