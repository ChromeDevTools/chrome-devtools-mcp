/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../cli.js';

import * as consoleTools from './console.js';
import * as debuggerTools from './debugger.js';
import * as emulationTools from './emulation.js';
import * as extensionTools from './extensions.js';
import * as inputTools from './input.js';
import * as lighthouseTools from './lighthouse.js';
import * as memoryTools from './memory.js';
import * as networkTools from './network.js';
import * as pagesTools from './pages.js';
import * as performanceTools from './performance.js';
import * as screencastTools from './screencast.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
import * as slimTools from './slim/tools.js';
import * as snapshotTools from './snapshot.js';
import type {ToolDefinition} from './ToolDefinition.js';

export const createTools = (args: ParsedArguments) => {
  const rawTools = args.slim
    ? Object.values(slimTools)
    : [
        ...Object.values(consoleTools),
        ...Object.values(debuggerTools),
        ...Object.values(emulationTools),
        ...Object.values(extensionTools),
        ...Object.values(inputTools),
        ...Object.values(lighthouseTools),
        ...Object.values(memoryTools),
        ...Object.values(networkTools),
        ...Object.values(pagesTools),
        ...Object.values(performanceTools),
        ...Object.values(screencastTools),
        ...Object.values(screenshotTools),
        ...Object.values(scriptTools),
        ...Object.values(snapshotTools),
      ];

  const tools = [];
  for (const tool of rawTools) {
    if (typeof tool === 'function') {
      tools.push(tool(args));
    } else {
      tools.push(tool as ToolDefinition);
    }
  }

  tools.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  return tools;
};
