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

export const getDevtoolsComments = definePageTool({
  name: 'get_devtools_comments',
  description:
    'Retrieve active DevTools comment threads and their target context for the current page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
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

    if (threads.length === 0) {
      response.appendResponseLine('No open DevTools comments found.');
      return;
    }

    response.appendResponseLine(
      `Found ${threads.length} DevTools comment thread(s):`,
    );
    for (const thread of threads) {
      response.appendResponseLine(`\n### Thread: ${thread.id}`);
      response.appendResponseLine(`- Comment: ${thread.text}`);
      if (thread.backendNodeId !== undefined) {
        const elementUid = await page.resolveBackendNodeId(
          thread.backendNodeId,
        );
        if (elementUid) {
          response.appendResponseLine(
            `- Target element (snapshot UID): ${elementUid}`,
          );
        } else {
          response.appendResponseLine(
            `- Target element (backendNodeId): ${thread.backendNodeId}`,
          );
        }
      }
      if (thread.networkRequestId) {
        const reqid = page.resolveCdpRequestId(thread.networkRequestId);
        if (reqid !== undefined) {
          response.appendResponseLine(`- Network request ID (reqid): ${reqid}`);
        } else {
          response.appendResponseLine(
            `- Network request ID: ${thread.networkRequestId}`,
          );
        }
      }
      if (thread.editor) {
        const location = thread.editor.filePath
          ? `${thread.editor.filePath}:${thread.editor.lineNumber}`
          : `line ${thread.editor.lineNumber}`;
        response.appendResponseLine(`- Editor location: ${location}`);
      }
    }
  },
});

export const updateDevtoolsComment = definePageTool({
  name: 'update_devtools_comment',
  description:
    'Append an agent reply to a DevTools comment thread and mark it as resolved.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
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

export const revealDevtoolsTarget = definePageTool({
  name: 'reveal_devtools_target',
  description:
    'Navigate DevTools to a specified panel and highlight a target DOM node or network request.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
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
    backendNodeId: zod
      .number()
      .optional()
      .describe(
        'Optional backend DOM node ID to reveal in the Elements panel.',
      ),
    reqid: zod
      .number()
      .optional()
      .describe(
        'Optional network request ID (from chrome-devtools-mcp network tools) to reveal in the Network panel.',
      ),
    networkRequestId: zod
      .string()
      .optional()
      .describe(
        'Optional CDP network request ID to reveal in the Network panel.',
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

    const {panelName, uid, reqid} = request.params;
    let backendNodeId = request.params.backendNodeId;
    let networkRequestId = request.params.networkRequestId;

    if (uid) {
      const resolvedBackendNodeId = await page.resolveUidToBackendNodeId(uid);
      if (resolvedBackendNodeId !== undefined) {
        backendNodeId = resolvedBackendNodeId;
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
      async (
        panel: string,
        target: {backendNodeId?: number; networkRequestId?: string},
      ) => {
        await window.universe?.cd4aBridge?.reveal(panel, target);
      },
      panelName,
      {backendNodeId, networkRequestId},
    );

    let targetDesc = '';
    if (uid && backendNodeId !== undefined) {
      targetDesc = ` (revealing element ${uid} [backend node ${backendNodeId}])`;
    } else if (backendNodeId !== undefined) {
      targetDesc = ` (revealing backend node ${backendNodeId})`;
    } else if (reqid !== undefined && networkRequestId) {
      targetDesc = ` (revealing network request ${reqid} [${networkRequestId}])`;
    } else if (networkRequestId) {
      targetDesc = ` (revealing network request ${networkRequestId})`;
    }

    response.appendResponseLine(
      `Navigated to ${panelName} panel${targetDesc} in DevTools.`,
    );
  },
});
