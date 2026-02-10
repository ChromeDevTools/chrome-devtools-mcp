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

import {getUserDataDir} from '../browser.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

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

export const listOutputChannels = defineTool({
  name: 'list_output_channels',
  description:
    'List all available output channels in the VS Code Output panel (e.g., "Git", "TypeScript", "ESLint", "Extension Host").',
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['directCdp'],
  },
  schema: {},
  handler: async (_request, response) => {
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

    response.appendResponseLine('## Available Output Channels\n');

    const categoryLabels: Record<string, string> = {
      root: 'Main Logs',
      window: 'Window Logs',
      exthost: 'Extension Host',
      extension: 'Extension Logs',
      output: 'Output Channels',
    };

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

export const getOutputPanelContent = defineTool({
  name: 'get_output_panel_content',
  description:
    'Get the text content from the currently visible VS Code Output panel. Optionally switch to a specific output channel first.',
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['directCdp'],
  },
  schema: {
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
  },
  handler: async (request, response) => {
    const {channel, maxLines, tail, filter} = request.params;

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

    if (filter) {
      const needle = filter.toLowerCase();
      lines = lines.filter(line => line.toLowerCase().includes(needle));
    }

    const effectiveMax = maxLines ?? 200;
    const totalBeforeTrim = lines.length;
    if (lines.length > effectiveMax) {
      if (tail) {
        lines = lines.slice(-effectiveMax);
      } else {
        lines = lines.slice(0, effectiveMax);
      }
    }

    response.appendResponseLine(`## Output: ${targetFile.name}\n`);

    if (filter) {
      response.appendResponseLine(`_Filtered by: "${filter}"_\n`);
    }

    if (totalBeforeTrim > effectiveMax) {
      const position = tail ? 'last' : 'first';
      response.appendResponseLine(
        `_Showing ${position} ${lines.length} of ${totalBeforeTrim} lines_\n`,
      );
    }

    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      response.appendResponseLine('(no output or log is empty)');
    } else {
      response.appendResponseLine('```');
      for (const line of lines) {
        response.appendResponseLine(line);
      }
      response.appendResponseLine('```');
    }
  },
});
