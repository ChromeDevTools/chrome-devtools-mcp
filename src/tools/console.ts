/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ConsoleMessageType} from '../third_party/index.js';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const FILTERABLE_MESSAGE_TYPES: readonly [
  ConsoleMessageType,
  ...ConsoleMessageType[],
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
];

export const listConsoleMessages = defineTool({
  name: 'list_console_messages',
  description:
    'List all console messages for the currently selected page since the last navigation.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of messages to return. When omitted, returns all requests.',
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
    includePreviousNavigations: zod
      .boolean()
      .default(false)
      .optional()
      .describe('Whether to include messages from previous navigations.'),
  },
  handler: async (request, response) => {
    response.setIncludeConsoleData(true, {
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
      types: request.params.types,
      includePreviousNavigations: request.params.includePreviousNavigations,
    });
  },
});

export const getConsoleMessage = defineTool({
  name: 'get_console_message',
  description: `Gets a console message by its ID. You can get all messages by calling ${listConsoleMessages.name}.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
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
