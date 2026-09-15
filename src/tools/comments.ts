/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import type {
  CD4ACommentThread,
  CD4AEditorAnchorSignature,
  CD4ARevealTarget,
} from '../types.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export type CommentThreadPayload = CD4ACommentThread;
export type CommentEditorPayload = CD4AEditorAnchorSignature;
export type RevealTargetPayload = CD4ARevealTarget;

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
  handler: async (request, response) => {
    const page = request.page;
    try {
      await page.openDevTools();
      response.appendResponseLine('DevTools window opened successfully.');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      response.appendResponseLine(`Failed to open DevTools: ${message}`);
    }
    response.setIncludePages(true);
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
  handler: async (request, response) => {
    const page = request.page;
    const devtoolsPage = await page.getDevToolsPage();
    if (!devtoolsPage) {
      response.appendResponseLine(
        'DevTools window is not open for this page. Call open_devtools first to open DevTools.',
      );
      return;
    }

    const threads = await devtoolsPage.evaluate(() => {
      return window.universe?.cd4aBridge?.getCommentThreads() ?? [];
    });

    response.setDevToolsComments(threads);
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
  handler: async (request, response) => {
    const page = request.page;
    const devtoolsPage = await page.getDevToolsPage();
    if (!devtoolsPage) {
      response.appendResponseLine(
        'DevTools window is not open for this page. Call open_devtools first to open DevTools.',
      );
      return;
    }

    const {threadId, replyText} = request.params;
    const success = await devtoolsPage.evaluate(
      (id: string, reply: string | undefined) => {
        return (
          window.universe?.cd4aBridge?.resolveCommentThread(id, reply) ?? false
        );
      },
      threadId,
      replyText,
    );

    if (success) {
      response.appendResponseLine(
        `Comment thread ${threadId} resolved successfully.`,
      );
      if (replyText) {
        response.appendResponseLine(`Agent reply added: "${replyText}"`);
      }
    } else {
      response.appendResponseLine(
        `Failed to resolve comment thread "${threadId}". Thread not found.`,
      );
    }
  },
});

export const revealInDevtools = definePageTool({
  name: 'reveal_in_devtools',
  description:
    'Navigate DevTools to a specified panel and highlight a target DOM node or network request. The parameters uid and reqid are mutually exclusive.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['devtoolsComments'],
  },
  schema: {
    panelName: zod
      .string()
      .optional()
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
      .describe('Optional network request ID to reveal in the Network panel.'),
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const page = request.page;
    const devtoolsPage = await page.getDevToolsPage();
    if (!devtoolsPage) {
      response.appendResponseLine(
        'DevTools window is not open for this page. Call open_devtools first to open DevTools.',
      );
      return;
    }

    const {panelName, uid, reqid} = request.params;
    let backendNodeId: number | undefined;
    let targetId: string | undefined;
    let networkRequestId: string | undefined;

    if (uid) {
      const resolved = await page.resolveUidToBackendNodeId(uid);
      if (resolved) {
        backendNodeId = resolved.backendNodeId;
        targetId = resolved.targetId;
      } else {
        response.appendResponseLine(
          `Warning: Could not resolve snapshot UID "${uid}" to a backend DOM node ID.`,
        );
      }
    }

    if (reqid !== undefined) {
      const resolvedCdpRequestId = page.resolveReqidToCdpRequestId(reqid);
      if (resolvedCdpRequestId !== undefined) {
        networkRequestId = resolvedCdpRequestId;
      } else {
        response.appendResponseLine(
          `Warning: Could not resolve network request ID ${reqid} to a CDP request ID.`,
        );
      }
    }

    await devtoolsPage.evaluate(
      async (panel: string | undefined, target: CD4ARevealTarget) => {
        await window.universe?.cd4aBridge?.reveal(panel, target);
      },
      panelName,
      {backendNodeId, targetId, networkRequestId},
    );

    let targetDesc = '';
    if (uid && backendNodeId !== undefined) {
      targetDesc = ` (revealing element ${uid} [backend node ${backendNodeId}])`;
    } else if (reqid !== undefined && networkRequestId) {
      targetDesc = ` (revealing network request ${reqid} [${networkRequestId}])`;
    }

    if (panelName) {
      response.appendResponseLine(
        `Navigated to ${panelName} panel${targetDesc} in DevTools.`,
      );
    } else {
      response.appendResponseLine(`Revealed target${targetDesc} in DevTools.`);
    }
  },
});
