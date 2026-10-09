/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../config/ConfigParser.js';
import {mcpOptions} from '../config/mcp-options.js';
import type {YargsOptions} from '../third_party/index.js';

import * as commentsTools from './comments.js';
import * as consoleTools from './console.js';
import * as cssTools from './css.js';
import * as emulationTools from './emulation.js';
import * as extensionTools from './extensions.js';
import * as inputTools from './input.js';
import * as lighthouseTools from './lighthouse.js';
import * as memoryTools from './memory.js';
import * as networkTools from './network.js';
import * as pagesTools from './pages.js';
import * as performanceTools from './performance.js';
import * as pwaTools from './pwa.js';
import * as screencastTools from './screencast.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
import * as slimTools from './slim/tools.js';
import * as snapshotTools from './snapshot.js';
import * as thirdPartyDeveloperTools from './thirdPartyDeveloper.js';
import type {DefinedPageTool, ToolDefinition} from './ToolDefinition.js';
import * as webmcpTools from './webmcp.js';

export const createTools = (
  args: ParsedArguments,
): Array<ToolDefinition | DefinedPageTool> => {
  const rawTools = [
    ...Object.values(commentsTools),
    ...Object.values(consoleTools),
    ...Object.values(cssTools),
    ...Object.values(emulationTools),
    ...Object.values(extensionTools),
    ...Object.values(inputTools),
    ...Object.values(lighthouseTools),
    ...Object.values(memoryTools),
    ...Object.values(networkTools),
    ...Object.values(pagesTools),
    ...Object.values(performanceTools),
    ...Object.values(pwaTools),
    ...Object.values(screencastTools),
    ...Object.values(screenshotTools),
    ...Object.values(scriptTools),
    ...Object.values(slimTools),
    ...Object.values(snapshotTools),
    ...Object.values(thirdPartyDeveloperTools),
    ...Object.values(webmcpTools),
  ];

  const tools: Array<ToolDefinition | DefinedPageTool> = [];
  for (const tool of rawTools) {
    tools.push(tool(args));
  }

  tools.sort((a, b) => a.name.localeCompare(b.name));

  return tools;
};

/**
 * Returns true if the tool is gated behind a hidden (internal) flag. Such
 * tools are excluded from the generated documentation and CLI.
 */
export function requiresHiddenFlag(
  tool: ToolDefinition | DefinedPageTool,
): boolean {
  for (const condition of tool.annotations.conditions ?? []) {
    const option: YargsOptions = mcpOptions[condition];
    if (option.hidden) {
      return true;
    }
  }
  return false;
}
