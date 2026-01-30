/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Optional Tools Registration - Extension-only mode (v2.0.0)
 *
 * This module exports optional (site-dependent, potentially unstable) tools.
 * These tools depend on specific website UIs and may break when those UIs change.
 *
 * All tools use WebSocket relay via Chrome extension (no Puppeteer).
 *
 * Optional tools include:
 * - chatgpt-web: Interact with ChatGPT via extension
 * - gemini-web: Interact with Gemini via extension
 * - cdp-snapshot: Debug page state via CDP
 *
 * These tools are marked as "experimental" and "best-effort".
 * They are loaded by default but can be disabled via:
 * - MCP_DISABLE_WEB_LLM=true environment variable
 */

import type {ToolRegistry} from '../plugin-api.js';

import * as cdpSnapshotTools from './cdp-snapshot.js';
import * as chatgptWebTools from './chatgpt-web.js';
import * as chatgptGeminiWebTools from './chatgpt-gemini-web.js';
import * as geminiWebTools from './gemini-web.js';

/**
 * All optional (web-llm) tools as an array.
 */
export const optionalTools = [
  ...Object.values(cdpSnapshotTools),
  ...Object.values(chatgptWebTools),
  ...Object.values(chatgptGeminiWebTools),
  ...Object.values(geminiWebTools),
];

/**
 * Check if web-llm tools should be loaded.
 * Returns false if MCP_DISABLE_WEB_LLM is set to 'true'.
 */
export function shouldLoadWebLlmTools(): boolean {
  const disable = process.env.MCP_DISABLE_WEB_LLM;
  return disable !== 'true' && disable !== '1';
}

/**
 * Register optional tools with a ToolRegistry.
 * Respects MCP_DISABLE_WEB_LLM environment variable.
 */
export function registerOptionalTools(registry: ToolRegistry): number {
  if (!shouldLoadWebLlmTools()) {
    console.error('[tools] Web-LLM tools disabled via MCP_DISABLE_WEB_LLM');
    return 0;
  }

  let count = 0;
  for (const tool of optionalTools) {
    // Skip non-tool exports (like constants)
    if (
      tool &&
      typeof tool === 'object' &&
      'name' in tool &&
      'handler' in tool
    ) {
      try {
        registry.register(tool);
        count++;
      } catch (error) {
        // Log but don't fail - optional tools should not block startup
        console.error(
          `[tools] Failed to register optional tool: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (count > 0) {
    console.error(
      `[tools] Loaded ${count} optional web-llm tools (experimental, may break)`,
    );
  }

  return count;
}

/**
 * Get count of optional tools.
 */
export function getOptionalToolCount(): number {
  return optionalTools.filter(
    tool =>
      tool && typeof tool === 'object' && 'name' in tool && 'handler' in tool,
  ).length;
}

/**
 * Metadata about optional tools for documentation.
 */
export const WEB_LLM_TOOLS_INFO = {
  disclaimer:
    'Web-LLM tools (ask_chatgpt_web, ask_gemini_web, ask_chatgpt_gemini_web, take_cdp_snapshot, get_page_dom) are experimental and best-effort. ' +
    'They depend on specific website UIs and may break when those UIs change. ' +
    'For production use, consider using official APIs instead.',
  disableEnvVar: 'MCP_DISABLE_WEB_LLM',
  tools: [
    'ask_chatgpt_web',
    'ask_gemini_web',
    'ask_chatgpt_gemini_web',
    'take_cdp_snapshot',
    'get_page_dom',
  ],
};
