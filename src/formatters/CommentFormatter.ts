/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CD4ACommentThread, CD4AEditorAnchorSignature} from '../types.js';

export interface CommentFormatterOptions {
  resolveBackendNodeId?: (backendNodeId: number) => Promise<string | undefined>;
  resolveCdpRequestId?: (cdpRequestId: string) => number | undefined;
}

export interface StructuredCommentThread {
  id: string;
  text: string;
  elementUid?: string;
  reqid?: number;
  editor?: CD4AEditorAnchorSignature;
}

function formatCommentThread(thread: StructuredCommentThread): string {
  const lines: string[] = [
    `### Thread: ${thread.id}`,
    `- Comment: ${thread.text}`,
  ];
  if (thread.elementUid) {
    lines.push(`- Target element (snapshot UID): ${thread.elementUid}`);
  }
  if (thread.reqid !== undefined) {
    lines.push(`- Network request ID (reqid): ${thread.reqid}`);
  }
  if (thread.editor) {
    const location = thread.editor.filePath
      ? `${thread.editor.filePath}:${thread.editor.lineNumber}`
      : `line ${thread.editor.lineNumber}`;
    lines.push(`- Editor location: ${location}`);
  }
  return lines.join('\n');
}

function formatComments(threads: readonly StructuredCommentThread[]): string {
  if (threads.length === 0) {
    return 'No open DevTools comments found.';
  }
  const lines: string[] = [
    `Found ${threads.length} DevTools comment thread(s):`,
  ];
  for (const thread of threads) {
    lines.push(`\n${formatCommentThread(thread)}`);
  }
  return lines.join('\n');
}

export class CommentFormatter {
  readonly #threads: readonly StructuredCommentThread[];

  constructor(threads: readonly StructuredCommentThread[]) {
    this.#threads = threads;
  }

  static async from(
    threads: readonly CD4ACommentThread[],
    options?: CommentFormatterOptions,
  ): Promise<CommentFormatter> {
    const structuredThreads: StructuredCommentThread[] = [];
    for (const thread of threads) {
      let elementUid: string | undefined;
      const resolveBackendNodeId = options?.resolveBackendNodeId;
      if (thread.backendNodeId !== undefined && resolveBackendNodeId) {
        elementUid = await resolveBackendNodeId(thread.backendNodeId);
      }

      let reqid: number | undefined;
      const resolveCdpRequestId = options?.resolveCdpRequestId;
      if (thread.networkRequestId !== undefined && resolveCdpRequestId) {
        reqid = resolveCdpRequestId(thread.networkRequestId);
      }

      const item: StructuredCommentThread = {
        id: thread.id,
        text: thread.text,
      };
      if (elementUid) {
        item.elementUid = elementUid;
      }
      if (reqid !== undefined) {
        item.reqid = reqid;
      }
      if (thread.editor) {
        item.editor = thread.editor;
      }
      structuredThreads.push(item);
    }
    return new CommentFormatter(structuredThreads);
  }

  static formatThread(thread: StructuredCommentThread): string {
    return formatCommentThread(thread);
  }

  toJSON(): StructuredCommentThread[] {
    return [...this.#threads];
  }

  toString(): string {
    return formatComments(this.toJSON());
  }
}
