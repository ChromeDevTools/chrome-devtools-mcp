/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory} from '../tools/categories.js';

export interface CategoryOptionOnByDefault {
  type: 'boolean';
  describe: string;
  default: boolean;
  hidden?: boolean;
  conflicts?: string[];
}

export interface CategoryOptionOffByDefault {
  type: 'boolean';
  describe: string;
  default?: boolean;
  hidden?: boolean;
  conflicts?: string[];
}

export interface CategoryFlags {
  categoryInput: CategoryOptionOnByDefault;
  categoryNavigation: CategoryOptionOnByDefault;
  categoryEmulation: CategoryOptionOnByDefault;
  categoryPerformance: CategoryOptionOnByDefault;
  categoryNetwork: CategoryOptionOnByDefault;
  categoryDebugging: CategoryOptionOnByDefault;
  categoryMemory: CategoryOptionOnByDefault;
  categoryExtensions: CategoryOptionOffByDefault;
  categoryExperimentalThirdParty: CategoryOptionOffByDefault;
  categoryExperimentalWebmcp: CategoryOptionOffByDefault;
  categoryPwa: CategoryOptionOffByDefault;
}

const categoryOverrides: Record<
  ToolCategory,
  {
    describe?: string;
    hidden?: boolean;
    conflicts?: string[];
  }
> = {
  [ToolCategory.INPUT]: {},
  [ToolCategory.NAVIGATION]: {},
  [ToolCategory.EMULATION]: {},
  [ToolCategory.PERFORMANCE]: {},
  [ToolCategory.NETWORK]: {},
  [ToolCategory.DEBUGGING]: {},
  [ToolCategory.MEMORY]: {},
  [ToolCategory.WEBMCP]: {
    describe:
      'Set to true to enable debugging WebMCP tools. Requires Chrome 150+ with the following flag: `--enable-features=WebMCP`',
  },
  [ToolCategory.EXTENSIONS]: {
    describe:
      'Set to true to include tools related to extensions. Note: This feature is currently only supported with a pipe connection. autoConnect, browserUrl, and wsEndpoint are not supported with this feature until 149 will be released.',
    hidden: false,
  },
  [ToolCategory.THIRD_PARTY]: {
    describe:
      'Set to true to enable third-party developer tools exposed by the inspected page itself',
  },
  [ToolCategory.PWA]: {
    describe:
      'Set to true to include tools for automating Progressive Web Apps (install, launch, uninstall, and OS state). This feature is only supported with a pipe connection; autoConnect, browserUrl, and wsEndpoint are not supported.',
    conflicts: ['autoConnect', 'browserUrl', 'wsEndpoint'],
    hidden: false,
  },
};

function createOnByDefaultOption(
  category: ToolCategory,
): CategoryOptionOnByDefault {
  const overrides = categoryOverrides[category];
  return {
    type: 'boolean',
    describe:
      overrides.describe ??
      `Set to false to exclude tools related to ${category}.`,
    ...overrides,
    default: true,
    hidden: overrides.hidden ?? true,
  };
}

function createOffByDefaultOption(
  category: ToolCategory,
): CategoryOptionOffByDefault {
  const overrides = categoryOverrides[category];
  return {
    type: 'boolean',
    describe:
      overrides.describe ??
      `Set to true to include tools related to ${category}.`,
    ...overrides,
  };
}

export function getCategoryOptions(): CategoryFlags {
  return {
    categoryInput: createOnByDefaultOption(ToolCategory.INPUT),
    categoryNavigation: createOnByDefaultOption(ToolCategory.NAVIGATION),
    categoryEmulation: createOnByDefaultOption(ToolCategory.EMULATION),
    categoryPerformance: createOnByDefaultOption(ToolCategory.PERFORMANCE),
    categoryNetwork: createOnByDefaultOption(ToolCategory.NETWORK),
    categoryDebugging: createOnByDefaultOption(ToolCategory.DEBUGGING),
    categoryMemory: createOnByDefaultOption(ToolCategory.MEMORY),
    categoryExtensions: createOffByDefaultOption(ToolCategory.EXTENSIONS),
    categoryExperimentalThirdParty: createOffByDefaultOption(
      ToolCategory.THIRD_PARTY,
    ),
    categoryExperimentalWebmcp: createOffByDefaultOption(ToolCategory.WEBMCP),
    categoryPwa: createOffByDefaultOption(ToolCategory.PWA),
  };
}

export const categoryToFlagName: Record<ToolCategory, keyof CategoryFlags> = {
  [ToolCategory.INPUT]: 'categoryInput',
  [ToolCategory.NAVIGATION]: 'categoryNavigation',
  [ToolCategory.EMULATION]: 'categoryEmulation',
  [ToolCategory.PERFORMANCE]: 'categoryPerformance',
  [ToolCategory.NETWORK]: 'categoryNetwork',
  [ToolCategory.DEBUGGING]: 'categoryDebugging',
  [ToolCategory.MEMORY]: 'categoryMemory',
  [ToolCategory.EXTENSIONS]: 'categoryExtensions',
  [ToolCategory.THIRD_PARTY]: 'categoryExperimentalThirdParty',
  [ToolCategory.WEBMCP]: 'categoryExperimentalWebmcp',
  [ToolCategory.PWA]: 'categoryPwa',
};

function isToolCategory(val: string): val is ToolCategory {
  for (const cat of Object.values(ToolCategory)) {
    if (cat === val) {
      return true;
    }
  }
  return false;
}

export function isCategoryOffByDefault(
  category: ToolCategory | string,
): boolean {
  if (!isToolCategory(category)) {
    return false;
  }
  const flagName = categoryToFlagName[category];
  const option = getCategoryOptions()[flagName];
  return !('default' in option) || option.default !== true;
}

export function getCategoryFlag(category: ToolCategory | string): string {
  if (!isToolCategory(category)) {
    return '';
  }
  return categoryToFlagName[category];
}

export function getOffByDefaultCategories(): ToolCategory[] {
  const result: ToolCategory[] = [];
  for (const category of Object.values(ToolCategory)) {
    if (isCategoryOffByDefault(category)) {
      result.push(category);
    }
  }
  return result;
}
