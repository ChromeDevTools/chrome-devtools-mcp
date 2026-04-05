/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as autonomyTools from './autonomy.js';
import * as consoleTools from './console.js';
import * as emulationTools from './emulation.js';
import * as inputTools from './input.js';
import * as networkTools from './network.js';
import * as pagesTools from './pages.js';
import * as pdfTools from './pdf.js';
import * as profileTools from './profiles.js';
import * as performanceTools from './performance.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
import * as snapshotTools from './snapshot.js';
import type {ToolDefinition} from './ToolDefinition.js';

const tools = [
  ...Object.values(autonomyTools),
  ...Object.values(consoleTools),
  ...Object.values(emulationTools),
  ...Object.values(inputTools),
  ...Object.values(networkTools),
  ...Object.values(pagesTools),
  ...Object.values(pdfTools),
  ...Object.values(performanceTools),
  ...Object.values(profileTools),
  ...Object.values(screenshotTools),
  ...Object.values(scriptTools),
  ...Object.values(snapshotTools),
] as ToolDefinition[];

tools.sort((a, b) => {
  return a.name.localeCompare(b.name);
});

export {tools};
