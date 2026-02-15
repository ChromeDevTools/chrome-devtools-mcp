/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {restartMcpServer} from '../host-pipe.js';
import {logger} from '../logger.js';
import {
  getMcpServerRoot,
  hasMcpServerSourceChanged,
  writeHotReloadMarker,
} from '../mcp-server-watcher.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

export const reloadMcpServer = defineTool({
  name: 'reload_mcp_server',
  description: `Force a graceful restart of the MCP server process.

The MCP server automatically detects source and build changes before every tool call,
but this tool lets you explicitly trigger a restart at any time — useful after dependency
changes, config edits, or when you want to confirm the server is running the latest code.

If source files have changed since the last build, the server will rebuild first.
After the response is sent, the server exits and VS Code respawns it automatically.

Args:
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  Confirmation that the MCP server is restarting.

Examples:
  - "Reload the MCP server" -> {}
  - "Restart MCP" -> {}`,
  timeoutMs: 130_000,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['standalone'],
  },
  schema: {
    response_format: responseFormatSchema,
  },
  handler: async (request, response) => {
    const mcpServerDir = getMcpServerRoot();
    const sourceChanged = hasMcpServerSourceChanged(mcpServerDir);

    let status: string;
    if (sourceChanged) {
      status = 'Source changes detected — the pre-tool hot-reload check will rebuild before restarting.';
    } else {
      status = 'No source changes detected — restarting with current build.';
    }

    logger(`[reload_mcp_server] ${status}`);

    writeHotReloadMarker(mcpServerDir);

    // Schedule restart after this response is flushed via stdio
    setTimeout(async () => {
      logger('[reload_mcp_server] Sending restart RPC to Host extension…');
      try {
        await restartMcpServer();
      } catch {
        logger('[reload_mcp_server] Restart RPC failed — exiting anyway');
      }
      process.exit(0);
    }, 500);

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify({
        action: 'restart',
        sourceChanged,
        status,
      }, null, 2));
      return;
    }

    response.appendResponseLine([
      '⚡ **MCP server restarting…**',
      '',
      status,
      '',
      'The server will exit after this response and VS Code will respawn it automatically.',
      'Please call your tool again after the restart.',
    ].join('\n'));
  },
});
