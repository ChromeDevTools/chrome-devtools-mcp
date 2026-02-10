/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getConsoleMessages, getConsoleMessageById} from '../cdp-events.js';
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

const ConsoleMessageSchema = zod.object({
  id: zod.number(),
  type: zod.string(),
  text: zod.string(),
  timestamp: zod.number(),
  stackTrace: zod.array(zod.object({
    functionName: zod.string().optional(),
    url: zod.string(),
    lineNumber: zod.number(),
    columnNumber: zod.number(),
  })).optional(),
});

const DetailedConsoleMessageSchema = zod.object({
  id: zod.number(),
  type: zod.string(),
  text: zod.string(),
  timestamp: zod.string(),
  args: zod.array(zod.object({
    type: zod.string(),
    value: zod.unknown().optional(),
    description: zod.string().optional(),
  })).optional(),
  stackTrace: zod.array(zod.object({
    functionName: zod.string().optional(),
    url: zod.string(),
    lineNumber: zod.number(),
    columnNumber: zod.number(),
  })).optional(),
});

const ReadConsoleOutputSchema = zod.union([
  zod.object({
    total: zod.number(),
    count: zod.number(),
    offset: zod.number(),
    has_more: zod.boolean(),
    next_offset: zod.number().optional(),
    messages: zod.array(ConsoleMessageSchema),
  }),
  DetailedConsoleMessageSchema,
]);

export const readConsole = defineTool({
  name: 'read_console',
  description: `Read console messages from the currently selected page. Can either list all messages with filtering, or get a specific message by ID with full details.

**Mode 1: List messages** (when msgid is NOT provided)
Lists console messages since the last navigation with optional filtering and pagination.

Args:
  - pageSize (number): Maximum messages to return. Default: all
  - pageIdx (number): Page number (0-based) for pagination. Default: 0
  - types (string[]): Filter by message types (log, error, warning, info, debug, etc.)
  - textFilter (string): Case-insensitive substring to match in message text
  - sourceFilter (string): Substring to match in stack trace source URLs
  - isRegex (boolean): Treat textFilter as regex pattern. Default: false
  - secondsAgo (number): Only messages from last N seconds
  - filterLogic ('and'|'or'): How to combine filters. Default: 'and'
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { total, count, offset, has_more, next_offset?, messages: [{id, type, text, timestamp, stackTrace?}] }
  Markdown format: Formatted list with msgid, type tag, text, and first stack frame

**Mode 2: Get single message** (when msgid IS provided)
Gets detailed information about a specific console message including arguments.

Args:
  - msgid (number): The message ID to retrieve
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { id, type, text, timestamp, args?, stackTrace? }
  Markdown format: Formatted message details with arguments and stack trace

Examples:
  - "Show only errors" -> { types: ['error'] }
  - "Find fetch failures" -> { textFilter: 'net::ERR', types: ['error'] }
  - "Recent warnings" -> { types: ['warning'], secondsAgo: 60 }
  - "Get message 5" -> { msgid: 5 }
  - "Get message as JSON" -> { msgid: 5, response_format: 'json' }

Error Handling:
  - Returns "No console messages found." if no messages match filters
  - Returns "Console message with id X not found." if msgid doesn't exist
  - Returns error with available params if response exceeds ${CHARACTER_LIMIT} chars`,
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
    msgid: zod
      .number()
      .optional()
      .describe(
        'The ID of a specific console message to retrieve with full details. When provided, returns only that message with arguments and stack trace. When omitted, lists all messages.',
      ),
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of messages to return. When omitted, returns all messages. Only used when listing messages (msgid not provided).',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page. Only used when listing messages (msgid not provided).',
      ),
    types: zod
      .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe(
        'Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages. Only used when listing messages (msgid not provided).',
      ),
    textFilter: zod
      .string()
      .optional()
      .describe(
        'Case-insensitive substring to match against the message text. Only messages whose text contains this string are returned. Only used when listing messages (msgid not provided).',
      ),
    sourceFilter: zod
      .string()
      .optional()
      .describe(
        'Substring to match against the source URL in the stack trace. Only messages originating from a matching source are returned. Only used when listing messages (msgid not provided).',
      ),
    isRegex: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, treat textFilter as a regular expression pattern. Default is false (substring match). Only used when listing messages (msgid not provided).',
      ),
    secondsAgo: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Only return messages from the last N seconds. Useful for filtering recent activity. Only used when listing messages (msgid not provided).',
      ),
    filterLogic: zod
      .enum(['and', 'or'])
      .optional()
      .default('and')
      .describe(
        'How to combine multiple filters. "and" = all filters must match (default). "or" = any filter can match. Only used when listing messages (msgid not provided).',
      ),
    includePreservedMessages: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Set to true to return the preserved messages over the last 3 navigations. Only used when listing messages (msgid not provided).',
      ),
  },
  outputSchema: ReadConsoleOutputSchema,
  handler: async (request, response) => {
    // Mode 2: Get specific message by ID
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

    // Mode 1: List all messages with filtering
    const {messages, total} = getConsoleMessages({
      types: request.params.types,
      textFilter: request.params.textFilter,
      sourceFilter: request.params.sourceFilter,
      isRegex: request.params.isRegex,
      secondsAgo: request.params.secondsAgo,
      filterLogic: request.params.filterLogic,
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
    });

    const offset = (request.params.pageIdx ?? 0) * (request.params.pageSize ?? messages.length);
    const pagination = createPaginationMetadata(total, messages.length, offset);

    if (messages.length === 0) {
      response.appendResponseLine('No console messages found.');
      return;
    }

    const structuredOutput = {
      ...pagination,
      messages: messages.map(msg => ({
        id: msg.id,
        type: msg.type,
        text: msg.text,
        timestamp: msg.timestamp,
        ...(msg.stackTrace?.length ? {
          stackTrace: msg.stackTrace.map(f => ({
            functionName: f.functionName,
            url: f.url,
            lineNumber: f.lineNumber,
            columnNumber: f.columnNumber,
          })),
        } : {}),
      })),
    };

    if (request.params.response_format === ResponseFormat.JSON) {
      const jsonOutput = JSON.stringify(structuredOutput, null, 2);
      checkCharacterLimit(jsonOutput, 'read_console', {
        pageSize: 'Limit results per page (e.g., 20)',
        types: 'Filter by specific types (e.g., ["error"])',
        textFilter: 'Filter by text content',
        secondsAgo: 'Limit to recent messages',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    const filterParts: string[] = [];
    if (request.params.types?.length) {
      filterParts.push(`types: ${request.params.types.join(', ')}`);
    }
    if (request.params.textFilter) {
      filterParts.push(
        `text${request.params.isRegex ? ' (regex)' : ''}: "${request.params.textFilter}"`,
      );
    }
    if (request.params.sourceFilter) {
      filterParts.push(`source: "${request.params.sourceFilter}"`);
    }
    if (request.params.secondsAgo) {
      filterParts.push(`last ${request.params.secondsAgo}s`);
    }

    let header = `## Console Messages\n\n`;
    header += `**Results:** ${messages.length} of ${total} total`;
    if (pagination.has_more) {
      header += ` | **Next page:** pageIdx=${pagination.next_offset! / (request.params.pageSize ?? messages.length)}`;
    }
    if (filterParts.length > 0) {
      const logic = request.params.filterLogic === 'or' ? 'OR' : 'AND';
      header += `\n**Filters (${logic}):** ${filterParts.join(' | ')}`;
    }
    response.appendResponseLine(header + '\n');

    const lines: string[] = [];
    for (const msg of messages) {
      const typeTag = `[${msg.type}]`;
      lines.push(`msgid=${msg.id} ${typeTag} ${msg.text}`);
      if (msg.stackTrace?.length) {
        const first = msg.stackTrace[0];
        lines.push(`  at ${first.functionName || '(anonymous)'} (${first.url}:${first.lineNumber + 1}:${first.columnNumber + 1})`);
      }
    }

    const content = lines.join('\n');
    checkCharacterLimit(content, 'read_console', {
      pageSize: 'Limit results per page (e.g., 20)',
      types: 'Filter by specific types (e.g., ["error"])',
      textFilter: 'Filter by text content',
      secondsAgo: 'Limit to recent messages',
    });

    response.appendResponseLine(content);
  },
});
