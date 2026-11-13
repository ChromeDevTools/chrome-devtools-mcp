/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from '../../config/mcp-options.js';

import {
  isCapabilityEnabled,
  type AnyToolDefinition,
  type ToolSchema,
} from '../ToolDefinition.js';

export const INNER_REPL_TOOL_NAMES: ReadonlySet<string> = new Set([
  'click',
  'click_at',
  'drag',
  'execute_3p_developer_tool',
  'execute_webmcp_tool',
  'fill',
  'fill_form',
  'get_console_message',
  'get_css_styles',
  'get_network_request',
  'hover',
  'list_3p_developer_tools',
  'list_console_messages',
  'list_network_requests',
  'list_webmcp_tools',
  'press_key',
  'take_screenshot',
  'take_snapshot',
  'type_text',
  'wait_for',
]);

const SHARED_OUTER_AND_INNER_TOOL_NAMES: ReadonlySet<string> = new Set([
  'wait_for',
]);

export const STRIPPED_INNER_PARAMS: ReadonlySet<string> = new Set([
  'filePath',
  'requestFilePath',
  'responseFilePath',
  'serviceWorkerId',
]);

export interface ReplToolPartition {
  outerTools: AnyToolDefinition[];
  innerTools: AnyToolDefinition[];
}

export function stripReplToolParams(
  schema: ToolSchema,
  options?: {stripPageId?: boolean},
): ToolSchema {
  const stripped: ToolSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (
      (options?.stripPageId && key === 'pageId') ||
      STRIPPED_INNER_PARAMS.has(key)
    ) {
      continue;
    }
    stripped[key] = value;
  }
  return stripped;
}

function stripInnerVerifyFilesParams(
  verifyFilesSchema: AnyToolDefinition['verifyFilesSchema'],
): AnyToolDefinition['verifyFilesSchema'] {
  const stripped: AnyToolDefinition['verifyFilesSchema'] = {};
  for (const [key, value] of Object.entries(verifyFilesSchema)) {
    if (!STRIPPED_INNER_PARAMS.has(key)) {
      stripped[key] = value;
    }
  }
  return stripped;
}

function cloneInnerToolWithStrippedParams<T extends AnyToolDefinition>(
  tool: T,
): T {
  return {
    ...tool,
    schema: stripReplToolParams(tool.schema),
    verifyFilesSchema: stripInnerVerifyFilesParams(tool.verifyFilesSchema),
  };
}

export function partitionToolsForRepl(
  tools: readonly AnyToolDefinition[],
  args: ParsedArguments,
): ReplToolPartition {
  const outerTools: AnyToolDefinition[] = [];
  const innerTools: AnyToolDefinition[] = [];

  for (const tool of tools) {
    if (
      !INNER_REPL_TOOL_NAMES.has(tool.name) ||
      SHARED_OUTER_AND_INNER_TOOL_NAMES.has(tool.name)
    ) {
      outerTools.push(tool);
    }

    if (
      INNER_REPL_TOOL_NAMES.has(tool.name) &&
      isCapabilityEnabled(tool.annotations, args)
    ) {
      innerTools.push(cloneInnerToolWithStrippedParams(tool));
    }
  }

  return {
    outerTools,
    innerTools,
  };
}
