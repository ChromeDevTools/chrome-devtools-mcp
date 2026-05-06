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
  THIRD_PARTY = 'experimentalThirdParty',
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
  [ToolCategory.THIRD_PARTY]: 'Third-party',
  [ToolCategory.MEMORY]: 'Memory',
  [ToolCategory.WEBMCP]: 'WebMCP',
};

export const OFF_BY_DEFAULT_CATEGORIES = [
  ToolCategory.EXTENSIONS,
  ToolCategory.THIRD_PARTY,
  ToolCategory.WEBMCP,
];
