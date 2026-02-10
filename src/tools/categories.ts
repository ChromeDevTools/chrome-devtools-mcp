/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ToolCategory {
  INPUT = 'input',
  NAVIGATION = 'navigation',
  DEBUGGING = 'debugging',
  EDITOR_TABS = 'editor_tabs',
  UI_CONTEXT = 'ui_context',
  DEV_DIAGNOSTICS = 'dev_diagnostics',
}

export const labels = {
  [ToolCategory.INPUT]: 'Input automation',
  [ToolCategory.NAVIGATION]: 'Navigation automation',
  [ToolCategory.DEBUGGING]: 'Debugging',
  [ToolCategory.EDITOR_TABS]: 'Editor tabs',
  [ToolCategory.UI_CONTEXT]: 'UI context',
  [ToolCategory.DEV_DIAGNOSTICS]: 'Development diagnostics',
};
