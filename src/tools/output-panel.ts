/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool for reading output panel content from VS Code.
 * Reads log files directly from the VS Code user data directory,
 * so the Output panel does not need to be open in the GUI.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {zod} from '../third_party/index.js';
import {getUserDataDir} from '../vscode.js';

import {ToolCategory} from './categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  checkCharacterLimit,
} from './ToolDefinition.js';

interface LogFileInfo {
  name: string;
  path: string;
  size: number;
  category: string;
}

/**
 * Recursively find all .log files in a directory.
 */
function findLogFiles(dir: string, category = 'root'): LogFileInfo[] {
  const results: LogFileInfo[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      let newCategory = category;
      if (entry.name.startsWith('window')) {
        newCategory = 'window';
      } else if (entry.name === 'exthost') {
        newCategory = 'exthost';
      } else if (entry.name.startsWith('output_')) {
        newCategory = 'output';
      } else if (entry.name.startsWith('vscode.')) {
        newCategory = 'extension';
      }
      results.push(...findLogFiles(fullPath, newCategory));
    } else if (entry.name.endsWith('.log')) {
      const stats = fs.statSync(fullPath);
      results.push({
        name: entry.name.replace('.log', ''),
        path: fullPath,
        size: stats.size,
        category,
      });
    }
  }

  return results;
}

/**
 * Get the latest session logs directory.
 */
function getLatestLogsDir(): string | null {
  const userDataDir = getUserDataDir();
  if (!userDataDir) {
    return null;
  }

  const logsDir = path.join(userDataDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    return null;
  }

  const sessions = fs
    .readdirSync(logsDir, {withFileTypes: true})
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse();

  if (sessions.length === 0) {
    return null;
  }

  return path.join(logsDir, sessions[0]);
}

const categoryLabels: Record<string, string> = {
  root: 'Main Logs',
  window: 'Window Logs',
  exthost: 'Extension Host',
  extension: 'Extension Logs',
  output: 'Output Channels',
};

const ReadOutputOutputSchema = zod.union([
  zod.object({
    mode: zod.literal('list'),
    total: zod.number(),
    channels: zod.array(zod.object({
      name: zod.string(),
      category: zod.string(),
      sizeKb: zod.number(),
    })),
  }),
  zod.object({
    mode: zod.literal('content'),
    channel: zod.string(),
    total_lines: zod.number(),
    content: zod.string(),
  }),
]);

export const readOutput = defineTool({
  name: 'read_output',
  description: `Read VS Code output logs from the workspace session. When called without a channel, lists all available output channels. When called with a channel name, returns the complete log content.

Args:
  - channel (string): Optional. Output channel name to read (e.g., "exthost", "main", "Git"). If omitted, lists all available channels.
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  When channel is omitted (list mode):
    JSON format: { mode: 'list', total, channels: [{name, category, sizeKb}] }
    Markdown format: Organized list by category (Main Logs, Extension Host, Output Channels, etc.)
  
  When channel is provided (content mode):
    JSON format: { mode: 'content', channel, total_lines, content }
    Markdown format: Full log content in a code block

Examples:
  - "List all channels" -> {}
  - "Read extension host logs" -> { channel: "exthost" }
  - "Read main VS Code logs" -> { channel: "main" }

Error Handling:
  - Returns "No logs directory found." if VS Code debug window isn't running
  - Returns "Channel X not found." with available channels if channel doesn't exist`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    channel: zod
      .string()
      .optional()
      .describe(
        'Name of the output channel to read (e.g., "exthost", "main", "Git"). If omitted, lists all available channels.',
      ),
    response_format: responseFormatSchema,
  },
  outputSchema: ReadOutputOutputSchema,
  handler: async (request, response) => {
    const logsDir = getLatestLogsDir();

    if (!logsDir) {
      response.appendResponseLine(
        'No logs directory found. Make sure VS Code debug window is running.',
      );
      return;
    }

    const logFiles = findLogFiles(logsDir);

    if (logFiles.length === 0) {
      response.appendResponseLine('No log files found.');
      return;
    }

    const {channel} = request.params;

    if (!channel) {
      const byCategory: Record<string, LogFileInfo[]> = {};
      for (const file of logFiles) {
        if (!byCategory[file.category]) {
          byCategory[file.category] = [];
        }
        byCategory[file.category].push(file);
      }

      if (request.params.response_format === ResponseFormat.JSON) {
        const channels = logFiles.map(f => ({
          name: f.name,
          category: categoryLabels[f.category] ?? f.category,
          sizeKb: parseFloat((f.size / 1024).toFixed(1)),
        }));
        response.appendResponseLine(JSON.stringify({
          mode: 'list',
          total: channels.length,
          channels,
        }, null, 2));
        return;
      }

      response.appendResponseLine('## Available Output Channels\n');

      for (const [category, files] of Object.entries(byCategory)) {
        response.appendResponseLine(
          `### ${categoryLabels[category] ?? category}\n`,
        );
        for (const file of files) {
          const sizeKb = (file.size / 1024).toFixed(1);
          response.appendResponseLine(`- **${file.name}** (${sizeKb} KB)`);
        }
        response.appendResponseLine('');
      }
      return;
    }

    const needle = channel.toLowerCase();
    let targetFile = logFiles.find(f => f.name.toLowerCase() === needle);
    if (!targetFile) {
      targetFile = logFiles.find(f =>
        f.name.toLowerCase().includes(needle),
      );
    }

    if (!targetFile) {
      response.appendResponseLine(
        `Channel "${channel}" not found. Available channels:`,
      );
      for (const file of logFiles) {
        response.appendResponseLine(`- ${file.name}`);
      }
      return;
    }

    let content: string;
    try {
      content = fs.readFileSync(targetFile.path, 'utf-8');
    } catch (err) {
      response.appendResponseLine(
        `Error reading log file: ${(err as Error).message}`,
      );
      return;
    }

    const lines = content.split('\n');
    const totalLines = lines.length;

    if (request.params.response_format === ResponseFormat.JSON) {
      const structuredOutput = {
        mode: 'content',
        channel: targetFile.name,
        total_lines: totalLines,
        content,
      };
      const jsonOutput = JSON.stringify(structuredOutput, null, 2);
      checkCharacterLimit(jsonOutput, 'read_output', {
        channel: 'Try a different channel with less content',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    response.appendResponseLine(`## Output: ${targetFile.name}\n`);
    response.appendResponseLine(`_Total lines: ${totalLines}_\n`);

    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      response.appendResponseLine('(no output or log is empty)');
    } else {
      const formattedContent = '```\n' + content + '\n```';
      checkCharacterLimit(formattedContent, 'read_output', {
        channel: 'Try a different channel with less content',
      });
      response.appendResponseLine(formattedContent);
    }
  },
});
