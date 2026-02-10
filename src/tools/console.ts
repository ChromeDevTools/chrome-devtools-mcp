/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getConsoleMessages, getConsoleMessageById} from '../cdp-events.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

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

export const listConsoleMessages = defineTool({
  name: 'list_console_messages',
  description:
    'List all console messages for the currently selected page since the last navigation.',
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['directCdp'],
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of messages to return. When omitted, returns all messages.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
    types: zod
      .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe(
        'Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.',
      ),
    textFilter: zod
      .string()
      .optional()
      .describe(
        'Case-insensitive substring to match against the message text. Only messages whose text contains this string are returned.',
      ),
    sourceFilter: zod
      .string()
      .optional()
      .describe(
        'Substring to match against the source URL in the stack trace. Only messages originating from a matching source are returned.',
      ),
    includePreservedMessages: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Set to true to return the preserved messages over the last 3 navigations.',
      ),
  },
  handler: async (request, response) => {
    const {messages, total} = getConsoleMessages({
      types: request.params.types,
      textFilter: request.params.textFilter,
      sourceFilter: request.params.sourceFilter,
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
    });

    if (messages.length === 0) {
      response.appendResponseLine('No console messages found.');
      return;
    }

    response.appendResponseLine(`Console messages (${messages.length} of ${total} total):\n`);

    for (const msg of messages) {
      const typeTag = `[${msg.type.toUpperCase()}]`;
      response.appendResponseLine(`msgid=${msg.id} ${typeTag} ${msg.text}`);
      if (msg.stackTrace?.length) {
        const first = msg.stackTrace[0];
        response.appendResponseLine(`  at ${first.functionName || '(anonymous)'} (${first.url}:${first.lineNumber + 1}:${first.columnNumber + 1})`);
      }
    }
  },
});

export const getConsoleMessage = defineTool({
  name: 'get_console_message',
  description: `Gets a console message by its ID. You can get all messages by calling ${listConsoleMessages.name}.`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['directCdp'],
  },
  schema: {
    msgid: zod
      .number()
      .describe(
        'The msgid of a console message on the page from the listed console messages',
      ),
  },
  handler: async (request, response) => {
    const msg = getConsoleMessageById(request.params.msgid);

    if (!msg) {
      response.appendResponseLine(`Console message with id ${request.params.msgid} not found.`);
      return;
    }

    response.appendResponseLine(`msgid=${msg.id}`);
    response.appendResponseLine(`type=${msg.type}`);
    response.appendResponseLine(`text=${msg.text}`);
    response.appendResponseLine(`timestamp=${new Date(msg.timestamp).toISOString()}`);

    if (msg.args.length > 0) {
      response.appendResponseLine('\nArguments:');
      for (const arg of msg.args) {
        if (arg.value !== undefined) {
          response.appendResponseLine(`  [${arg.type}] ${JSON.stringify(arg.value)}`);
        } else if (arg.description) {
          response.appendResponseLine(`  [${arg.type}] ${arg.description}`);
        } else {
          response.appendResponseLine(`  [${arg.type}]`);
        }
      }
    }

    if (msg.stackTrace?.length) {
      response.appendResponseLine('\nStack trace:');
      for (const frame of msg.stackTrace) {
        response.appendResponseLine(`  at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`);
      }
    }
  },
});
