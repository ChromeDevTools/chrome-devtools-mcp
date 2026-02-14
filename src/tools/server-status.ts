/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server status tool — reports MCP server build and runtime info.
 * Useful for testing hot-reload and confirming the server is running
 * the latest code.
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

const ServerStatusSchema = zod.object({
  version: zod.string(),
  uptimeSeconds: zod.number(),
  pid: zod.number(),
  startedAt: zod.string(),
  buildMarker: zod.string(),
});

const processStartedAt = Date.now();

export const serverStatus = defineTool({
  name: 'server_status',
  description: `Report the MCP server's current build and runtime status.

Shows server version, uptime, PID, and a build marker to confirm hot-reload
applied the latest code. Useful for verifying the MCP server restarted
successfully after a source change.

Args:
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { version, uptimeSeconds, pid, startedAt, buildMarker }
  Markdown format: Formatted server status summary`,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['standalone'],
  },
  schema: {
    response_format: responseFormatSchema,
  },
  handler: async ({params}, response) => {
    const format: ResponseFormat =
      (params.response_format as ResponseFormat) ?? ResponseFormat.MARKDOWN;
    const uptimeMs = Date.now() - processStartedAt;
    const uptimeSeconds = Math.round(uptimeMs / 1000);

    // Build marker — change this string when testing hot-reload
    const BUILD_MARKER = 'hot-reload-v2';

    const data = {
      version: '0.16.0',
      uptimeSeconds,
      pid: process.pid,
      startedAt: new Date(processStartedAt).toISOString(),
      buildMarker: BUILD_MARKER,
    };

    if (format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify(data, null, 2));
      return;
    }

    response.appendResponseLine([
      '## MCP Server Status',
      '',
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Version** | ${data.version} |`,
      `| **PID** | ${data.pid} |`,
      `| **Uptime** | ${data.uptimeSeconds}s |`,
      `| **Started At** | ${data.startedAt} |`,
      `| **Build Marker** | \`${data.buildMarker}\` |`,
    ].join('\n'));
  },
});
