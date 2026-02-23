/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ConsoleMessageType} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
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

export const listConsoleMessages = defineTool({
  name: 'list_console_messages',
  description: 'List all console messages since the last navigation.',
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
      .describe('Max messages to return. Omit for all.'),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe('0-based page number. Omit for first page.'),
    types: zod
      .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe('Filter by message type. Omit or empty for all.'),
    includePreservedMessages: zod
      .boolean()
      .default(false)
      .optional()
      .describe('Set to true for preserved messages over last 3 navigations.'),
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

export const getConsoleMessage = defineTool({
  name: 'get_console_message',
  description: `Gets a console message by its ID. You can get all messages by calling ${listConsoleMessages.name}.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    msgid: zod
      .number()
      .describe('msgid of a console message from listed messages'),
  },
  handler: async (request, response) => {
    response.attachConsoleMessage(request.params.msgid);
  },
});
