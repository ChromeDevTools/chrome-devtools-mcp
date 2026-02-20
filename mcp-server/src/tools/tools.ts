/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as codebaseTools from './codebase/index.js';
import * as consoleTools from './console.js';
import * as elicitationTools from './elicitation-demo.js';
import * as fileTools from './file/index.js';
import * as inputTools from './input.js';
import * as screenshotTools from './screenshot.js';
import * as snapshotTools from './snapshot.js';
import type {ToolDefinition} from './ToolDefinition.js';

const tools = [
  ...Object.values(codebaseTools),
  ...Object.values(consoleTools),
  ...Object.values(elicitationTools),
  ...Object.values(fileTools),
  ...Object.values(inputTools),
  ...Object.values(screenshotTools),
  ...Object.values(snapshotTools),
] as unknown as ToolDefinition[];

tools.sort((a, b) => {
  return a.name.localeCompare(b.name);
});

export {tools};
