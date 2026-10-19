/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory} from '../tools/categories.js';

export interface CategoryOption {
  type: 'boolean';
  describe: string;
  default?: boolean;
  defaultDescription?: string;
  hidden?: boolean;
  reloadable?: boolean;
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
    offByDefault?: boolean;
    reloadable?: boolean;
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
      'Set to true to enable WebMCP tools (excluding debugging tools, which are exposed under the third-party developer tools category). Requires Chrome 150+ with the following flag: `--enable-features=WebMCP`',
    offByDefault: true,
  },
  [ToolCategory.EXTENSIONS]: {
    describe: 'Set to true to include tools related to extensions.',
    offByDefault: true,
    reloadable: false,
  },
  [ToolCategory.THIRD_PARTY]: {
    describe:
      'Set to true to enable third-party developer tools exposed by the inspected page itself (via WebMCP or devtoolstooldiscovery)',
    offByDefault: true,
  },
  [ToolCategory.PWA]: {
    describe:
      'Set to true to include tools for automating Progressive Web Apps (install, launch, uninstall, and OS state). This feature is only supported with a pipe connection; autoConnect, browserUrl, and wsEndpoint are not supported.',
    offByDefault: true,
  },
  [ToolCategory.WEBAUTHN]: {
    describe:
      'Set to true to include a tool that manages virtual WebAuthn authenticators, for testing passkey and security key flows.',
    offByDefault: true,
  },
};

function createOption(category: ToolCategory): CategoryOption {
  const overrides = categoryOverrides[category];
  const describe = overrides.offByDefault
    ? `Set to true to include tools related to ${category}.`
    : `Set to false to exclude tools related to ${category}.`;

  return {
    type: 'boolean',
    describe,
    reloadable: true,
    ...overrides,
    // Off-by-default categories have no default so that they stay unset unless
    // passed explicitly. This keeps them out of conflict checks and lets
    // --viaCli apply its own categoryExtensions default.
    ...(overrides.offByDefault ? {} : {default: true}),
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

export function isCategoryOffByDefault(category: ToolCategory): boolean {
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
