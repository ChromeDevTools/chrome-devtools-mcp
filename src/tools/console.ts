/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getConsoleMessages, getConsoleMessageById} from '../cdp-events.js';
import {zod} from '../third_party/index.js';

import {consolidateLines} from '../log-consolidator.js';

import {ToolCategory} from './categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  CHARACTER_LIMIT,
  checkCharacterLimit,
  logFormatSchema,
} from './ToolDefinition.js';

const FILTERABLE_MESSAGE_TYPES: [string, ...string[]] = [
  'log',
  'debug',
  'info',
  'error',
  'warning',
  'warn',
  'dir',
  'dirxml',
  'table',
  'trace',
  'clear',
  'startGroup',
  'startGroupCollapsed',
  'endGroup',
  'assert',
  'profile',
  'profileEnd',
  'count',
  'timeEnd',
  'verbose',
];

const AVAILABLE_FIELDS: [string, ...string[]] = [
  'id',
  'type', 
  'text',
  'timestamp',
  'stackTrace',
  'args',
];

const ConsoleMessageSchema = zod.object({
  id: zod.number().optional(),
  type: zod.string().optional(),
  text: zod.string().optional(),
  timestamp: zod.number().optional(),
  stackTrace: zod.array(zod.object({
    functionName: zod.string().optional(),
    url: zod.string(),
    lineNumber: zod.number(),
    columnNumber: zod.number(),
  })).optional(),
  args: zod.array(zod.object({
    type: zod.string(),
    value: zod.unknown().optional(),
    description: zod.string().optional(),
  })).optional(),
});

const ReadConsoleOutputSchema = zod.object({
  total: zod.number(),
  returned: zod.number(),
  hasMore: zod.boolean(),
  oldestId: zod.number().optional(),
  newestId: zod.number().optional(),
  messages: zod.array(ConsoleMessageSchema),
});

export const readConsole = defineTool({
  name: 'read_console',
  description: `Read console messages with full control over filtering and detail level.

**FILTERING OPTIONS:**

- \`limit\` (number): Get the N most recent messages. Default: all messages
- \`types\` (string[]): Filter by log type: 'error', 'warning', 'info', 'debug', 'log', 'trace', etc.
- \`pattern\` (string): Regex pattern to match against message text
- \`sourcePattern\` (string): Regex pattern to match against source URLs in stack traces
- \`afterId\` (number): Only messages after this ID (for incremental reads - avoids re-reading)
- \`beforeId\` (number): Only messages before this ID

**DETAIL CONTROL (reduce context size):**

- \`fields\` (string[]): Which fields to include. Options: 'id', 'type', 'text', 'timestamp', 'stackTrace', 'args'. Default: ['id', 'type', 'text']
- \`textLimit\` (number): Max characters per message text (truncates with "..."). Default: unlimited
- \`stackDepth\` (number): Max stack frames to include per message. Default: 1. Set 0 to exclude.

**EXAMPLES:**

Minimal error scan (smallest context):
  { types: ['error'], limit: 20, fields: ['id', 'text'], textLimit: 100 }

Full error details:
  { types: ['error'], limit: 5, fields: ['id', 'type', 'text', 'args', 'stackTrace'], stackDepth: 5 }

Incremental read (only new messages since last read):
  { afterId: 42 }

Find specific pattern:
  { pattern: "TypeError|ReferenceError", limit: 10 }

Warnings from specific source:
  { types: ['warning'], sourcePattern: "extension\\\\.ts" }

**RESPONSE METADATA:**

Returns: { total, returned, hasMore, oldestId?, newestId?, messages: [...] }
- \`total\`: Total messages matching filters (before limit applied)
- \`hasMore\`: Whether there are older messages not returned (use limit or afterId to get more)
- \`oldestId\`/\`newestId\`: ID range in response (use newestId as afterId for next incremental read)`,
  timeoutMs: 15000,
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

    // Filtering
    limit: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Get the N most recent messages. Omit to get all messages.'),
    types: zod
      .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe('Filter by log types: error, warning, info, debug, log, trace, etc.'),
    pattern: zod
      .string()
      .optional()
      .describe('Regex pattern to match against message text (case-insensitive).'),
    sourcePattern: zod
      .string()
      .optional()
      .describe('Regex pattern to match against source URLs in stack traces.'),
    afterId: zod
      .number()
      .int()
      .optional()
      .describe('Only return messages with ID greater than this (for incremental reads).'),
    beforeId: zod
      .number()
      .int()
      .optional()
      .describe('Only return messages with ID less than this.'),

    // Detail control
    fields: zod
      .array(zod.enum(AVAILABLE_FIELDS))
      .optional()
      .describe('Which fields to include per message. Default: [id, type, text]. Options: id, type, text, timestamp, stackTrace, args'),
    textLimit: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Max characters per message text. Longer messages are truncated with "...".'),
    stackDepth: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Max stack frames to include. Default: 1. Set 0 to exclude stack traces entirely.'),

    // Legacy support (hidden from main docs but still works)
    msgid: zod
      .number()
      .optional()
      .describe('Get a specific message by ID with full details.'),

    // Log consolidation
    logFormat: logFormatSchema,
  },
  outputSchema: ReadConsoleOutputSchema,
  handler: async (request, response) => {
    // Mode: Get specific message by ID (legacy support)
    if (request.params.msgid !== undefined) {
      const msg = getConsoleMessageById(request.params.msgid);

      if (!msg) {
        response.appendResponseLine(`Console message with id ${request.params.msgid} not found.`);
        return;
      }

      const structuredOutput = {
        id: msg.id,
        type: msg.type,
        text: msg.text,
        timestamp: new Date(msg.timestamp).toISOString(),
        ...(msg.args.length > 0 ? {
          args: msg.args.map(arg => ({
            type: arg.type,
            ...(arg.value !== undefined ? { value: arg.value } : {}),
            ...(arg.description ? { description: arg.description } : {}),
          })),
        } : {}),
        ...(msg.stackTrace?.length ? {
          stackTrace: msg.stackTrace.map(f => ({
            functionName: f.functionName,
            url: f.url,
            lineNumber: f.lineNumber,
            columnNumber: f.columnNumber,
          })),
        } : {}),
      };

      if (request.params.response_format === ResponseFormat.JSON) {
        response.appendResponseLine(JSON.stringify(structuredOutput, null, 2));
        return;
      }

      response.appendResponseLine(`## Console Message #${msg.id}\n`);
      response.appendResponseLine(`**Type:** ${msg.type}`);
      response.appendResponseLine(`**Text:** ${msg.text}`);
      response.appendResponseLine(`**Timestamp:** ${structuredOutput.timestamp}`);

      if (msg.args.length > 0) {
        response.appendResponseLine('\n### Arguments');
        for (const arg of msg.args) {
          if (arg.value !== undefined) {
            response.appendResponseLine(`- [${arg.type}] ${JSON.stringify(arg.value)}`);
          } else if (arg.description) {
            response.appendResponseLine(`- [${arg.type}] ${arg.description}`);
          } else {
            response.appendResponseLine(`- [${arg.type}]`);
          }
        }
      }

      if (msg.stackTrace?.length) {
        response.appendResponseLine('\n### Stack Trace');
        for (const frame of msg.stackTrace) {
          response.appendResponseLine(`- at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`);
        }
      }
      return;
    }

    // Mode: List messages with filtering
    const {
      limit,
      types,
      pattern,
      sourcePattern,
      afterId,
      beforeId,
      fields = ['id', 'type', 'text'],
      textLimit,
      stackDepth = 1,
    } = request.params;

    // Build regex patterns
    let textRegex: RegExp | null = null;
    if (pattern) {
      try {
        textRegex = new RegExp(pattern, 'i');
      } catch {
        response.appendResponseLine(`Invalid regex pattern: ${pattern}`);
        return;
      }
    }

    let sourceRegex: RegExp | null = null;
    if (sourcePattern) {
      try {
        sourceRegex = new RegExp(sourcePattern, 'i');
      } catch {
        response.appendResponseLine(`Invalid source pattern: ${sourcePattern}`);
        return;
      }
    }

    // Get all messages and apply filters
    const {messages: allMessages} = getConsoleMessages({});
    
    let filtered = allMessages.filter(m => {
      // Type filter
      if (types?.length && !types.includes(m.type)) {
        return false;
      }

      // Text pattern filter
      if (textRegex && !textRegex.test(m.text)) {
        return false;
      }

      // Source pattern filter
      if (sourceRegex) {
        const hasMatchingSource = m.stackTrace?.some(frame => sourceRegex!.test(frame.url));
        if (!hasMatchingSource) {
          return false;
        }
      }

      // ID range filters
      if (afterId !== undefined && m.id <= afterId) {
        return false;
      }
      if (beforeId !== undefined && m.id >= beforeId) {
        return false;
      }

      return true;
    });

    const total = filtered.length;

    // Apply limit (from the end - most recent)
    if (limit !== undefined && filtered.length > limit) {
      filtered = filtered.slice(-limit);
    }

    const returned = filtered.length;
    const hasMore = total > returned;

    if (filtered.length === 0) {
      if (request.params.response_format === ResponseFormat.JSON) {
        response.appendResponseLine(JSON.stringify({
          total: 0,
          returned: 0,
          hasMore: false,
          messages: [],
        }, null, 2));
      } else {
        response.appendResponseLine('No console messages found matching the specified filters.');
      }
      return;
    }

    const oldestId = filtered[0]?.id;
    const newestId = filtered[filtered.length - 1]?.id;

    // Build output with selected fields and detail control
    const fieldSet = new Set(fields);
    const includeStackTrace = fieldSet.has('stackTrace') && stackDepth > 0;
    const includeArgs = fieldSet.has('args');

    const outputMessages = filtered.map(msg => {
      const out: Record<string, unknown> = {};

      if (fieldSet.has('id')) {
        out.id = msg.id;
      }
      if (fieldSet.has('type')) {
        out.type = msg.type;
      }
      if (fieldSet.has('text')) {
        let text = msg.text;
        if (textLimit !== undefined && text.length > textLimit) {
          text = text.slice(0, textLimit) + '...';
        }
        out.text = text;
      }
      if (fieldSet.has('timestamp')) {
        out.timestamp = msg.timestamp;
      }
      if (includeStackTrace && msg.stackTrace?.length) {
        const frames = msg.stackTrace.slice(0, stackDepth);
        out.stackTrace = frames.map(f => ({
          functionName: f.functionName,
          url: f.url,
          lineNumber: f.lineNumber,
          columnNumber: f.columnNumber,
        }));
      }
      if (includeArgs && msg.args.length > 0) {
        out.args = msg.args.map(arg => ({
          type: arg.type,
          ...(arg.value !== undefined ? { value: arg.value } : {}),
          ...(arg.description ? { description: arg.description } : {}),
        }));
      }

      return out;
    });

    const structuredOutput = {
      total,
      returned,
      hasMore,
      ...(oldestId !== undefined ? { oldestId } : {}),
      ...(newestId !== undefined ? { newestId } : {}),
      messages: outputMessages,
    };

    if (request.params.response_format === ResponseFormat.JSON) {
      const jsonOutput = JSON.stringify(structuredOutput, null, 2);
      checkCharacterLimit(jsonOutput, 'read_console', {
        limit: 'Reduce number of messages (e.g., limit: 20)',
        fields: 'Reduce fields (e.g., fields: ["id", "text"])',
        textLimit: 'Truncate message text (e.g., textLimit: 100)',
        stackDepth: 'Reduce stack frames (e.g., stackDepth: 0)',
        types: 'Filter by specific types (e.g., types: ["error"])',
        pattern: 'Filter by text pattern',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    // Markdown output
    const filterParts: string[] = [];
    if (types?.length) {
      filterParts.push(`types: ${types.join(', ')}`);
    }
    if (pattern) {
      filterParts.push(`pattern: /${pattern}/`);
    }
    if (sourcePattern) {
      filterParts.push(`source: /${sourcePattern}/`);
    }
    if (afterId !== undefined) {
      filterParts.push(`after: #${afterId}`);
    }
    if (limit !== undefined) {
      filterParts.push(`limit: ${limit}`);
    }

    let header = `## Console Messages\n\n`;
    header += `**Returned:** ${returned} of ${total} total`;
    if (hasMore) {
      header += ` (use \`afterId: ${oldestId! - 1}\` or increase \`limit\` to see more)`;
    }
    if (newestId !== undefined) {
      header += `\n**ID range:** ${oldestId} - ${newestId}`;
    }
    if (filterParts.length > 0) {
      header += `\n**Filters:** ${filterParts.join(' | ')}`;
    }
    response.appendResponseLine(header + '\n');

    const lines: string[] = [];
    for (const msg of outputMessages) {
      const parts: string[] = [];
      if (msg.id !== undefined) {
        parts.push(`#${msg.id}`);
      }
      if (msg.type !== undefined) {
        parts.push(`[${msg.type}]`);
      }
      if (msg.text !== undefined) {
        parts.push(String(msg.text));
      }
      lines.push(parts.join(' '));

      if (msg.stackTrace && Array.isArray(msg.stackTrace)) {
        for (const frame of msg.stackTrace as Array<{functionName?: string; url: string; lineNumber: number; columnNumber: number}>) {
          lines.push(`  at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`);
        }
      }
    }

    // Apply log consolidation to reduce repetitive console output
    const consolidated = consolidateLines(lines, {
      format: request.params.logFormat,
      label: 'Console',
    });

    if (consolidated.hasCompression) {
      const content = consolidated.formatted;
      checkCharacterLimit(content, 'read_console', {
        limit: 'Reduce number of messages (e.g., limit: 20)',
        logFormat: 'Switch format (e.g., logFormat: "summary")',
        types: 'Filter by specific types (e.g., types: ["error"])',
        pattern: 'Filter by text pattern',
      });
      response.appendResponseLine(content);
    } else {
      // No groups to collapse — use original line output
      const content = lines.join('\n');
      checkCharacterLimit(content, 'read_console', {
        limit: 'Reduce number of messages (e.g., limit: 20)',
        fields: 'Reduce fields (e.g., fields: ["id", "text"])',
        textLimit: 'Truncate message text (e.g., textLimit: 100)',
        stackDepth: 'Reduce stack frames (e.g., stackDepth: 0)',
        types: 'Filter by specific types (e.g., types: ["error"])',
        pattern: 'Filter by text pattern',
      });
      response.appendResponseLine(content);
    }
  },
});
