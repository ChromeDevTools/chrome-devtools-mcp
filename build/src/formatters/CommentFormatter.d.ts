/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CD4ACommentThread } from '../types.js';
export interface CommentFormatterOptions {
    resolveBackendNodeId?: (backendNodeId: number) => Promise<string | undefined>;
    resolveCdpRequestId?: (cdpRequestId: string) => number | undefined;
}
export interface StructuredCommentThread {
    id: string;
    text: string;
    elementUid?: string;
    reqid?: number;
}
export declare class CommentFormatter {
    #private;
    constructor(threads: readonly StructuredCommentThread[]);
    static from(threads: readonly CD4ACommentThread[], options?: CommentFormatterOptions): Promise<CommentFormatter>;
    static formatThread(thread: StructuredCommentThread): string;
    toJSON(): StructuredCommentThread[];
    toString(): string;
}
