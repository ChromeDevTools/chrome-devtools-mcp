/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core Tools Registration
 *
 * This module exports all core (stable, site-independent) tools.
 * These tools are always available and do not depend on specific websites.
 *
 * Core tools include:
 * - Input automation (click, fill, drag, etc.)
 * - Navigation (pages, navigate, resize)
 * - Emulation (CPU, network)
 * - Performance analysis
 * - Debugging (console, screenshot, snapshot, script)
 * - Network inspection
 * - Extension management (this fork's differentiator)
 *
 * Optional/plugin tools (NOT included here):
 * - chatgpt-web (site-dependent, may break)
 * - gemini-web (site-dependent, may break)
 */

import type {ToolRegistry} from '../plugin-api.js';

import * as consoleTools from './console.js';
import * as emulationTools from './emulation.js';
import {click, drag, fill, fillForm, hover, uploadFile} from './input.js';
import * as networkTools from './network.js';
import {handleDialog, navigate, pages, resizePage} from './pages.js';
import * as performanceTools from './performance.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
import * as snapshotTools from './snapshot.js';

/**
 * All core tools as an array.
 */
export const coreTools = [
  // Input automation
  click,
  hover,
  fill,
  drag,
  fillForm,
  uploadFile,

  // Navigation
  pages,
  navigate,
  resizePage,
  handleDialog,

  // Console
  ...Object.values(consoleTools),

  // Emulation
  ...Object.values(emulationTools),

  // Network
  ...Object.values(networkTools),

  // Performance
  ...Object.values(performanceTools),

  // Screenshot
  ...Object.values(screenshotTools),

  // Script
  ...Object.values(scriptTools),

  // Snapshot
  ...Object.values(snapshotTools),
];

/**
 * Register all core tools with a ToolRegistry.
 */
export function registerCoreTools(registry: ToolRegistry): void {
  for (const tool of coreTools) {
    // Skip non-tool exports (like constants)
    if (
      tool &&
      typeof tool === 'object' &&
      'name' in tool &&
      'handler' in tool
    ) {
      registry.register(tool);
    }
  }
}

/**
 * Get count of core tools.
 */
export function getCoreToolCount(): number {
  return coreTools.filter(
    tool =>
      tool && typeof tool === 'object' && 'name' in tool && 'handler' in tool,
  ).length;
}
