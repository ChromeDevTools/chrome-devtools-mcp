/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @chrome-devtools-mcp/web-llm
 *
 * Web-LLM tools for chrome-devtools-mcp (ChatGPT/Gemini browser automation).
 *
 * This package is planned for future extraction from the main package.
 * Currently serves as a placeholder/documentation for the monorepo structure.
 *
 * Usage (future):
 * ```typescript
 * import { chatgptTools, geminiTools } from '@chrome-devtools-mcp/web-llm';
 * ```
 *
 * Current usage (v0.26.0):
 * ```bash
 * # Disable web-llm tools
 * MCP_DISABLE_WEB_LLM=true npx chrome-devtools-mcp-for-extension
 *
 * # Tools are included by default in chrome-devtools-mcp-for-extension
 * ```
 */

// Re-export types for plugin authors
export type {
  ToolDefinition,
  Context,
  Response,
} from 'chrome-devtools-mcp-for-extension/plugin-api';

/**
 * Plugin metadata for web-llm
 */
export const WEB_LLM_PLUGIN_INFO = {
  id: 'web-llm',
  name: 'Web-LLM Tools',
  version: '0.26.0',
  description: 'ChatGPT and Gemini browser automation tools',
  tools: ['ask_chatgpt_web', 'ask_gemini_web'],
  disclaimer:
    'These tools are experimental and best-effort. ' +
    'They depend on specific website UIs and may break when those UIs change.',
};

// Note: Actual tool implementations are in the main package
// This file will be updated when tools are fully extracted
