/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const openDevtools = definePageTool({
  name: 'open_devtools',
  description: 'Open a DevTools window for the selected page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['devtoolsComments'],
  },
  schema: {},
  blockedByDialog: false,
  verifyFilesSchema: [],
  handler: async () => {
    throw new Error('Not implemented');
  },
});

export const getDevtoolsComments = definePageTool({
  name: 'get_devtools_comments',
  description: 'Retrieve user comments from the DevTools window for the page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['devtoolsComments'],
  },
  schema: {},
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async () => {
    throw new Error('Not implemented');
  },
});

export const resolveDevtoolsComment = definePageTool({
  name: 'resolve_devtools_comment',
  description:
    'Append an agent reply to a DevTools comment thread and mark it as resolved.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['devtoolsComments'],
  },
  schema: {
    threadId: zod
      .string()
      .describe(
        'The unique identifier of the comment thread to resolve (e.g. "comment-1").',
      ),
    replyText: zod
      .string()
      .optional()
      .describe(
        'Optional reply explanation from the AI agent to append to the resolved comment thread.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async () => {
    throw new Error('Not implemented');
  },
});

export const revealInDevtools = definePageTool({
  name: 'reveal_in_devtools',
  description:
    'Navigate DevTools to a specified panel and highlight a target DOM node or network request.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['devtoolsComments'],
  },
  schema: {
    panelName: zod
      .string()
      .describe(
        'The target DevTools panel (e.g. "elements", "network", "sources", "console").',
      ),
    uid: zod
      .string()
      .optional()
      .describe(
        'Optional snapshot element UID to reveal in the Elements panel.',
      ),
    reqid: zod
      .number()
      .optional()
      .describe(
        'Optional network request ID (from chrome-devtools-mcp network tools) to reveal in the Network panel.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async () => {
    throw new Error('Not implemented');
  },
});
