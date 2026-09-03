/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory} from '../tools/categories.js';

export interface CategoryOption {
  type: 'boolean';
  describe: string;
  default: boolean;
  hidden?: boolean;
  conflicts?: string[];
}

export type CategoryFlagName<T extends ToolCategory = ToolCategory> =
  `category${Capitalize<T>}`;

export type CategoryFlags = {
  [K in ToolCategory as CategoryFlagName<K>]: CategoryOption;
};

const categoryOverrides: Record<
  ToolCategory,
  {
    describe?: string;
    hidden?: boolean;
    conflicts?: string[];
    default?: boolean;
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
    default: false,
  },
  [ToolCategory.EXTENSIONS]: {
    describe:
      'Set to true to include tools related to extensions. Note: This feature is currently only supported with a pipe connection. autoConnect, browserUrl, and wsEndpoint are not supported with this feature until 149 will be released.',
    hidden: false,
    default: false,
  },
  [ToolCategory.THIRD_PARTY]: {
    describe:
      'Set to true to enable third-party developer tools exposed by the inspected page itself',
    hidden: false,
    default: false,
  },
  [ToolCategory.PWA]: {
    describe:
      'Set to true to include tools for automating Progressive Web Apps (install, launch, uninstall, and OS state). This feature is only supported with a pipe connection; autoConnect, browserUrl, and wsEndpoint are not supported.',
    conflicts: ['autoConnect', 'browserUrl', 'wsEndpoint'],
    hidden: false,
    default: false,
  },
};

function createOption(category: ToolCategory): CategoryOption {
  const overrides = categoryOverrides[category];
  const defaultVal = overrides.default ?? true;
  const describe = defaultVal
    ? `Set to false to exclude tools related to ${category}.`
    : `Set to true to include tools related to ${category}.`;

  return {
    type: 'boolean',
    describe,
    ...overrides,
    default: defaultVal,
  };
}

export function categoryToFlagName(category: ToolCategory): CategoryFlagName {
  return `category${category.charAt(0).toUpperCase()}${category.slice(1)}` as CategoryFlagName;
}


export function getCategoryOptions(): CategoryFlags {
  const options = {} as CategoryFlags;
  for (const category of Object.values(ToolCategory)) {
    const flagName = categoryToFlagName(category);
    options[flagName] = createOption(category);
  }

  return options;
}

function isToolCategory(val: string): val is ToolCategory {
  for (const cat of Object.values(ToolCategory)) {
    if (cat === val) {
      return true;
    }
  }
  return false;
}

export function isCategoryOffByDefault(category: ToolCategory): boolean {
  if (!isToolCategory(category)) {
    return false;
  }
  const flagName = categoryToFlagName(category);
  const option = getCategoryOptions()[flagName];
  return !('default' in option) || option.default !== true;
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
