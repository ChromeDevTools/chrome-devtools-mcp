/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
function formatCommentThread(thread) {
    const lines = [
        `### Thread: ${thread.id}`,
        `- Comment: ${thread.text}`,
    ];
    if (thread.elementUid) {
        lines.push(`- Related element uid: ${thread.elementUid}`);
    }
    if (thread.reqid !== undefined) {
        lines.push(`- Related network reqid: ${thread.reqid}`);
    }
    return lines.join('\n');
}
function formatComments(threads) {
    if (threads.length === 0) {
        return 'No open DevTools comments found.';
    }
    const lines = [
        `Found ${threads.length} DevTools comment thread(s):`,
    ];
    for (const thread of threads) {
        lines.push(`\n${formatCommentThread(thread)}`);
    }
    return lines.join('\n');
}
export class CommentFormatter {
    #threads;
    constructor(threads) {
        this.#threads = threads;
    }
    static async from(threads, options) {
        const structuredThreads = [];
        for (const thread of threads) {
            let elementUid;
            const resolveBackendNodeId = options?.resolveBackendNodeId;
            if (thread.node?.backendNodeId !== undefined && resolveBackendNodeId) {
                elementUid = await resolveBackendNodeId(thread.node.backendNodeId);
            }
            let reqid;
            const resolveCdpRequestId = options?.resolveCdpRequestId;
            if (thread.networkRequestId !== undefined && resolveCdpRequestId) {
                reqid = resolveCdpRequestId(thread.networkRequestId);
            }
            const item = {
                id: thread.id,
                text: thread.text,
            };
            if (elementUid) {
                item.elementUid = elementUid;
            }
            if (reqid !== undefined) {
                item.reqid = reqid;
            }
            structuredThreads.push(item);
        }
        return new CommentFormatter(structuredThreads);
    }
    static formatThread(thread) {
        return formatCommentThread(thread);
    }
    toJSON() {
        return [...this.#threads];
    }
    toString() {
        return formatComments(this.toJSON());
    }
}
//# sourceMappingURL=CommentFormatter.js.map