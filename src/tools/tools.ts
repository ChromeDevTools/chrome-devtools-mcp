/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as consoleTools from './console.js';
import * as debugEvaluateTools from './debug-evaluate.js';
import * as inputTools from './input.js';
import * as outputPanelTools from './output-panel.js';
import * as processTools from './process.js';
import * as screenshotTools from './screenshot.js';
import * as serverStatusTools from './server-status.js';
import * as snapshotTools from './snapshot.js';
import * as targetsTools from './targets.js';
import * as taskTools from './task.js';
import * as terminalsTools from './terminals.js';
import * as terminalTools from './terminal.js';
import type {ToolDefinition} from './ToolDefinition.js';
import * as waitTools from './wait.js';

const tools = [
  ...Object.values(consoleTools),
  ...Object.values(debugEvaluateTools),
  ...Object.values(inputTools),
  ...Object.values(outputPanelTools),
  ...Object.values(processTools),
  ...Object.values(screenshotTools),
  ...Object.values(serverStatusTools),
  ...Object.values(snapshotTools),
  ...Object.values(targetsTools),
  ...Object.values(taskTools),
  ...Object.values(terminalsTools),
  ...Object.values(terminalTools),
  ...Object.values(waitTools),
] as unknown as ToolDefinition[];

tools.sort((a, b) => {
  return a.name.localeCompare(b.name);
});

export {tools};
