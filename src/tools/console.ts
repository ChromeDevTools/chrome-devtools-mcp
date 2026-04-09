/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ConsoleMessageType} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';
type ConsoleResponseType = ConsoleMessageType | 'issue';

const FILTERABLE_MESSAGE_TYPES: [
  ConsoleResponseType,
  ...ConsoleResponseType[],
] = [
  'log',
  'debug',
  'info',
  'error',
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
  'issue',
];

export const listConsoleMessages = definePageTool({
  name: 'list_console_messages',
  description: 'List console messages since last navigation.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Max messages to return. If omitted: all.'),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Page number (0-based). If omitted: 0.'),
    types: zod
      .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe('Filter by message types. If omitted: all.'),
    includePreservedMessages: zod
      .boolean()
      .default(false)
      .optional()
      .describe('Return preserved messages over last 3 navigations.'),
  },
  handler: async (request, response) => {
    response.setIncludeConsoleData(true, {
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
      types: request.params.types,
      includePreservedMessages: request.params.includePreservedMessages,
    });
  },
});

export const getConsoleMessage = definePageTool({
  name: 'get_console_message',
  description: `Gets a console message by its ID. You can get all messages by calling ${listConsoleMessages.name}.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    msgid: zod
      .number()
      .describe(
        'The msgid of a console message on the page from the listed console messages',
      ),
  },
  handler: async (request, response) => {
    response.attachConsoleMessage(request.params.msgid);
  },
});
