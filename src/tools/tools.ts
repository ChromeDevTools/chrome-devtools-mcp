/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as consoleTools from './console.js';
import * as debugEvaluateTools from './debug-evaluate.js';
import * as inputTools from './input.js';
import * as networkTools from './network.js';
import * as outputPanelTools from './output-panel.js';
import * as performanceTools from './performance.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
import * as snapshotTools from './snapshot.js';
import * as waitTools from './wait.js';
import type {ToolDefinition} from './ToolDefinition.js';

const tools = [
  ...Object.values(consoleTools),
  ...Object.values(debugEvaluateTools),
  ...Object.values(inputTools),
  ...Object.values(networkTools),
  ...Object.values(outputPanelTools),
  ...Object.values(performanceTools),
  ...Object.values(screenshotTools),
  ...Object.values(scriptTools),
  ...Object.values(snapshotTools),
  ...Object.values(waitTools),
] as unknown as ToolDefinition[];

tools.sort((a, b) => {
  return a.name.localeCompare(b.name);
});

export {tools};
