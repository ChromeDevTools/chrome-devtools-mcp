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

const ListOutputSchema = zod.object({
  mode: zod.literal('list'),
  total: zod.number(),
  channels: zod.array(zod.object({
    name: zod.string(),
    category: zod.string(),
    sizeKb: zod.number(),
  })),
});

const ContentOutputSchema = zod.object({
  mode: zod.literal('content'),
  channel: zod.string(),
  total: zod.number(),
  returned: zod.number(),
  hasMore: zod.boolean(),
  oldestLine: zod.number().optional(),
  newestLine: zod.number().optional(),
  filters: zod.string().optional(),
  lines: zod.array(zod.object({
    line: zod.number(),
    text: zod.string(),
  })),
});

const ReadOutputOutputSchema = zod.union([
  ListOutputSchema,
  ContentOutputSchema,
]);

export const readOutput = defineTool({
  name: 'read_output',
  description: `Read VS Code output logs from the workspace session. When called without a channel, lists all available output channels. When called with a channel name, returns log content with optional filtering.

**LISTING CHANNELS (no channel provided):**

Returns all available output channels organized by category.

**READING CHANNEL CONTENT (channel provided):**

**FILTERING OPTIONS:**

- \`limit\` (number): Get the N most recent lines. Default: all lines
- \`pattern\` (string): Regex pattern to match against line content (case-insensitive)
- \`afterLine\` (number): Only lines after this line number (for incremental reads - avoids re-reading)
- \`beforeLine\` (number): Only lines before this line number

**DETAIL CONTROL (reduce context size):**

- \`lineLimit\` (number): Max characters per line (truncates with "..."). Default: unlimited

**EXAMPLES:**

List all channels:
  {}

Read extension host logs:
  { channel: "exthost" }

Get last 50 lines:
  { channel: "exthost", limit: 50 }

Find errors in logs:
  { channel: "main", pattern: "error|exception|failed", limit: 100 }

Incremental read (only new lines since last read):
  { channel: "Git", afterLine: 150 }

Truncate long lines:
  { channel: "exthost", limit: 30, lineLimit: 200 }

**RESPONSE METADATA (content mode):**

Returns: { mode: 'content', channel, total, returned, hasMore, oldestLine?, newestLine?, lines: [...] }
- \`total\`: Total lines matching filters (before limit applied)
- \`hasMore\`: Whether there are older lines not returned
- \`oldestLine\`/\`newestLine\`: Line range in response (use newestLine as afterLine for next incremental read)

**ERROR HANDLING:**
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

    // Filtering
    limit: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Get the N most recent lines. Omit to get all lines.'),
    pattern: zod
      .string()
      .optional()
      .describe('Regex pattern to match against line content (case-insensitive).'),
    afterLine: zod
      .number()
      .int()
      .optional()
      .describe('Only return lines with line number greater than this (for incremental reads).'),
    beforeLine: zod
      .number()
      .int()
      .optional()
      .describe('Only return lines with line number less than this.'),

    // Detail control
    lineLimit: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Max characters per line. Longer lines are truncated with "...".'),
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

    const {limit, pattern, afterLine, beforeLine, lineLimit} = request.params;

    // Parse lines with line numbers (1-indexed)
    const allLines = content.split('\n');
    interface LineEntry {
      line: number;
      text: string;
    }
    let indexedLines: LineEntry[] = allLines.map((text, idx) => ({
      line: idx + 1,
      text,
    }));

    // Apply cursor filters (afterLine/beforeLine)
    if (afterLine !== undefined) {
      indexedLines = indexedLines.filter(l => l.line > afterLine);
    }
    if (beforeLine !== undefined) {
      indexedLines = indexedLines.filter(l => l.line < beforeLine);
    }

    // Apply pattern filter
    if (pattern) {
      const regex = new RegExp(pattern, 'i');
      indexedLines = indexedLines.filter(l => regex.test(l.text));
    }

    const totalMatching = indexedLines.length;
    let hasMore = false;

    // Apply limit (tail-style: take last N)
    if (limit !== undefined && indexedLines.length > limit) {
      hasMore = true;
      indexedLines = indexedLines.slice(-limit);
    }

    // Apply lineLimit (truncate long lines)
    if (lineLimit !== undefined) {
      indexedLines = indexedLines.map(l => ({
        line: l.line,
        text: l.text.length > lineLimit ? l.text.slice(0, lineLimit) + '...' : l.text,
      }));
    }

    // Build filter description for output
    const filterParts: string[] = [];
    if (pattern) filterParts.push(`pattern: ${pattern}`);
    if (afterLine !== undefined) filterParts.push(`afterLine: ${afterLine}`);
    if (beforeLine !== undefined) filterParts.push(`beforeLine: ${beforeLine}`);
    if (limit !== undefined) filterParts.push(`limit: ${limit}`);
    if (lineLimit !== undefined) filterParts.push(`lineLimit: ${lineLimit}`);
    const filtersDesc = filterParts.length > 0 ? filterParts.join(' | ') : undefined;

    const oldestLine = indexedLines.length > 0 ? indexedLines[0].line : undefined;
    const newestLine = indexedLines.length > 0 ? indexedLines[indexedLines.length - 1].line : undefined;

    if (request.params.response_format === ResponseFormat.JSON) {
      const structuredOutput: {
        mode: 'content';
        channel: string;
        total: number;
        returned: number;
        hasMore: boolean;
        oldestLine?: number;
        newestLine?: number;
        filters?: string;
        lines: LineEntry[];
      } = {
        mode: 'content',
        channel: targetFile.name,
        total: totalMatching,
        returned: indexedLines.length,
        hasMore,
        oldestLine,
        newestLine,
        filters: filtersDesc,
        lines: indexedLines,
      };
      const jsonOutput = JSON.stringify(structuredOutput, null, 2);
      checkCharacterLimit(jsonOutput, 'read_output', {
        limit: 'Use limit parameter to get fewer lines',
        lineLimit: 'Use lineLimit to truncate long lines',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    // Markdown format
    response.appendResponseLine(`## Output: ${targetFile.name}\n`);

    let summary = `**Returned:** ${indexedLines.length} of ${totalMatching} total`;
    if (hasMore) {
      summary += ` (use \`afterLine: ${oldestLine !== undefined ? oldestLine - 1 : 0}\` or increase \`limit\` to see more)`;
    }
    response.appendResponseLine(summary);

    if (oldestLine !== undefined && newestLine !== undefined) {
      response.appendResponseLine(`**Line range:** ${oldestLine} - ${newestLine}`);
    }

    if (filtersDesc) {
      response.appendResponseLine(`**Filters:** ${filtersDesc}`);
    }

    if (indexedLines.length === 0) {
      response.appendResponseLine('\n(no matching lines)');
    } else {
      const formattedLines = indexedLines
        .map(l => `${String(l.line).padStart(5, ' ')} | ${l.text}`)
        .join('\n');
      const formattedContent = '\n```\n' + formattedLines + '\n```';
      checkCharacterLimit(formattedContent, 'read_output', {
        limit: 'Use limit parameter to get fewer lines',
        lineLimit: 'Use lineLimit to truncate long lines',
      });
      response.appendResponseLine(formattedContent);
    }
  },
});
