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

import * as fs from 'fs';
import * as path from 'path';

import {getUserDataDir} from '../vscode.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  CHARACTER_LIMIT,
  checkCharacterLimit,
  createPaginationMetadata,
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

const LogFileInfoSchema = zod.object({
  name: zod.string(),
  path: zod.string(),
  size: zod.number(),
  category: zod.string(),
});

const ListOutputChannelsOutputSchema = zod.object({
  total: zod.number(),
  channels: zod.array(zod.object({
    name: zod.string(),
    category: zod.string(),
    sizeKb: zod.number(),
  })),
});

export const listOutputChannels = defineTool({
  name: 'list_output_channels',
  description: `List all available output channels in the VS Code Output panel (e.g., "Git", "TypeScript", "ESLint", "Extension Host").

Args:
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { total, channels: [{name, category, sizeKb}] }
  Markdown format: Organized list by category (Main Logs, Extension Host, Output Channels, etc.)

Examples:
  - "List all channels" -> {}
  - "Get channels as JSON" -> { response_format: 'json' }

Error Handling:
  - Returns "No logs directory found." if VS Code debug window isn't running
  - Returns "No log files found." if logs directory is empty`,
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
    response_format: responseFormatSchema,
  },
  outputSchema: ListOutputChannelsOutputSchema,
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

    const byCategory: Record<string, LogFileInfo[]> = {};
    for (const file of logFiles) {
      if (!byCategory[file.category]) {
        byCategory[file.category] = [];
      }
      byCategory[file.category].push(file);
    }

    const categoryLabels: Record<string, string> = {
      root: 'Main Logs',
      window: 'Window Logs',
      exthost: 'Extension Host',
      extension: 'Extension Logs',
      output: 'Output Channels',
    };

    if (request.params.response_format === ResponseFormat.JSON) {
      const channels = logFiles.map(f => ({
        name: f.name,
        category: categoryLabels[f.category] || f.category,
        sizeKb: parseFloat((f.size / 1024).toFixed(1)),
      }));
      response.appendResponseLine(JSON.stringify({ total: channels.length, channels }, null, 2));
      return;
    }

    response.appendResponseLine('## Available Output Channels\n');

    for (const [category, files] of Object.entries(byCategory)) {
      response.appendResponseLine(
        `### ${categoryLabels[category] || category}\n`,
      );
      for (const file of files) {
        const sizeKb = (file.size / 1024).toFixed(1);
        response.appendResponseLine(`- **${file.name}** (${sizeKb} KB)`);
      }
      response.appendResponseLine('');
    }
  },
});

const LOG_LEVELS: [string, ...string[]] = [
  'error',
  'warning',
  'info',
  'debug',
  'trace',
];

/**
 * Parse timestamp from a VS Code log line.
 * Format: 2026-02-09 19:31:05.070 [info] ...
 */
function parseLogTimestamp(line: string): Date | null {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
  if (match) {
    return new Date(match[1].replace(' ', 'T'));
  }
  return null;
}

/**
 * Extract log level from a VS Code log line.
 * Format: 2026-02-09 19:31:05.070 [info] ...
 */
function parseLogLevel(line: string): string | null {
  const match = line.match(/\[(error|warning|info|debug|trace)\]/i);
  return match ? match[1].toLowerCase() : null;
}

const GetOutputPanelContentOutputSchema = zod.object({
  channel: zod.string(),
  total_lines: zod.number(),
  returned_lines: zod.number(),
  has_more: zod.boolean(),
  filters: zod.object({
    text: zod.string().optional(),
    levels: zod.array(zod.string()).optional(),
    secondsAgo: zod.number().optional(),
    logic: zod.enum(['and', 'or']).optional(),
  }).optional(),
  lines: zod.array(zod.string()),
});

export const getOutputPanelContent = defineTool({
  name: 'get_output_panel_content',
  description: `Get the text content from the currently visible VS Code Output panel. Optionally switch to a specific output channel first.

Args:
  - channel (string): Output channel name (e.g., "Git", "TypeScript", "Extension Host"). Default: exthost or main
  - maxLines (number): Maximum lines to return. Default: 200
  - tail (boolean): Return last N lines (true) or first N (false). Default: true
  - filter (string): Case-insensitive substring filter
  - isRegex (boolean): Treat filter as regex. Default: false
  - levels (string[]): Filter by log levels (error, warning, info, debug, trace)
  - secondsAgo (number): Only lines from last N seconds
  - filterLogic ('and'|'or'): How to combine filters. Default: 'and'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { channel, total_lines, returned_lines, has_more, filters?, lines: [...] }
  Markdown format: Formatted log output with filter summary

Examples:
  - "Show errors from Extension Host" -> { channel: "exthost", levels: ["error"] }
  - "Recent TypeScript logs" -> { channel: "TypeScript", secondsAgo: 300 }
  - "Search for specific error" -> { filter: "ENOENT", isRegex: false }
  - "Get as JSON" -> { channel: "main", response_format: 'json' }

Error Handling:
  - Returns "Channel X not found." with available channels if channel doesn't exist
  - Returns error if response exceeds ${CHARACTER_LIMIT} chars`,
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
    response_format: responseFormatSchema,
    channel: zod
      .string()
      .optional()
      .describe(
        'Name of the output channel to read (e.g., "Git", "TypeScript", "Extension Host"). If omitted, reads the currently visible channel.',
      ),
    maxLines: zod
      .number()
      .int()
      .positive()
      .optional()
      .default(200)
      .describe(
        'Maximum number of lines to return. Default is 200. Use a smaller value to reduce output size.',
      ),
    tail: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, returns the last N lines (most recent). If false, returns the first N lines. Default is true.',
      ),
    filter: zod
      .string()
      .optional()
      .describe(
        'Case-insensitive substring filter. Only lines containing this text are returned.',
      ),
    isRegex: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, treat the filter as a regular expression pattern. Default is false (substring match).',
      ),
    levels: zod
      .array(zod.enum(LOG_LEVELS))
      .optional()
      .describe(
        'Filter by log level(s). Only lines with matching levels are returned. Levels: error, warning, info, debug, trace.',
      ),
    secondsAgo: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Only return log lines from the last N seconds. Useful for filtering recent activity.',
      ),
    filterLogic: zod
      .enum(['and', 'or'])
      .optional()
      .default('and')
      .describe(
        'How to combine multiple filters. "and" = all filters must match (default). "or" = any filter can match.',
      ),
  },
  outputSchema: GetOutputPanelContentOutputSchema,
  handler: async (request, response) => {
    const {
      channel,
      maxLines,
      tail,
      filter,
      isRegex,
      levels,
      secondsAgo,
      filterLogic,
    } = request.params;

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

    let targetFile: LogFileInfo | undefined;

    if (channel) {
      const needle = channel.toLowerCase();
      targetFile = logFiles.find(f => f.name.toLowerCase() === needle);
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
    } else {
      targetFile =
        logFiles.find(f => f.name === 'exthost') ||
        logFiles.find(f => f.name === 'main') ||
        logFiles[0];
    }

    if (!targetFile) {
      response.appendResponseLine('No log file selected.');
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

    let lines = content.split('\n');

    const now = new Date();
    const cutoffTime = secondsAgo
      ? new Date(now.getTime() - secondsAgo * 1000)
      : null;

    const levelSet = levels?.length ? new Set(levels) : null;

    let filterRegex: RegExp | null = null;
    if (filter && isRegex) {
      try {
        filterRegex = new RegExp(filter, 'i');
      } catch {
        response.appendResponseLine(
          `Invalid regex pattern: "${filter}". Falling back to substring match.`,
        );
      }
    }

    const useOr = filterLogic === 'or';

    lines = lines.filter(line => {
      const checks: boolean[] = [];

      if (filter) {
        if (filterRegex) {
          checks.push(filterRegex.test(line));
        } else {
          checks.push(line.toLowerCase().includes(filter.toLowerCase()));
        }
      }

      if (levelSet) {
        const lineLevel = parseLogLevel(line);
        checks.push(lineLevel !== null && levelSet.has(lineLevel));
      }

      if (cutoffTime) {
        const lineTime = parseLogTimestamp(line);
        checks.push(lineTime !== null && lineTime >= cutoffTime);
      }

      if (checks.length === 0) {
        return true;
      }

      return useOr ? checks.some(Boolean) : checks.every(Boolean);
    });

    const effectiveMax = maxLines ?? 200;
    const totalBeforeTrim = lines.length;
    if (lines.length > effectiveMax) {
      if (tail) {
        lines = lines.slice(-effectiveMax);
      } else {
        lines = lines.slice(0, effectiveMax);
      }
    }

    const hasMore = totalBeforeTrim > effectiveMax;

    const filters: Record<string, unknown> = {};
    if (filter) filters.text = filter;
    if (levelSet) filters.levels = [...levelSet];
    if (secondsAgo) filters.secondsAgo = secondsAgo;
    if (Object.keys(filters).length > 0) {
      filters.logic = useOr ? 'or' : 'and';
    }

    if (request.params.response_format === ResponseFormat.JSON) {
      const structuredOutput = {
        channel: targetFile.name,
        total_lines: totalBeforeTrim,
        returned_lines: lines.length,
        has_more: hasMore,
        ...(Object.keys(filters).length > 0 ? { filters } : {}),
        lines,
      };
      const jsonOutput = JSON.stringify(structuredOutput, null, 2);
      checkCharacterLimit(jsonOutput, 'get_output_panel_content', {
        maxLines: 'Reduce lines per request (e.g., 50)',
        filter: 'Filter by text to reduce results',
        levels: 'Filter by specific levels (e.g., ["error"])',
        secondsAgo: 'Limit to recent logs',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    response.appendResponseLine(`## Output: ${targetFile.name}\n`);

    const filterParts: string[] = [];
    if (filter) {
      filterParts.push(`text${isRegex ? ' (regex)' : ''}: "${filter}"`);
    }
    if (levelSet) {
      filterParts.push(`levels: ${[...levelSet].join(', ')}`);
    }
    if (secondsAgo) {
      filterParts.push(`last ${secondsAgo}s`);
    }
    if (filterParts.length > 0) {
      const logic = useOr ? 'OR' : 'AND';
      response.appendResponseLine(
        `_Filters (${logic}): ${filterParts.join(' | ')}_\n`,
      );
    }

    if (hasMore) {
      const position = tail ? 'last' : 'first';
      response.appendResponseLine(
        `_Showing ${position} ${lines.length} of ${totalBeforeTrim} lines_\n`,
      );
    }

    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      response.appendResponseLine('(no output or log is empty)');
    } else {
      const content = '```\n' + lines.join('\n') + '\n```';
      checkCharacterLimit(content, 'get_output_panel_content', {
        maxLines: 'Reduce lines per request (e.g., 50)',
        filter: 'Filter by text to reduce results',
        levels: 'Filter by specific levels (e.g., ["error"])',
        secondsAgo: 'Limit to recent logs',
      });
      response.appendResponseLine(content);
    }
  },
});
