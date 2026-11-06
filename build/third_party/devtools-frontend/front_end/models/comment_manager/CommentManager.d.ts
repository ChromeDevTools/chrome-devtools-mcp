import * as Common from '../../core/common/common.js';
import { type Comment, type CommentAnchorSignature, CommentThread, type CommentThreadOptions, type CommentThreadStatus, type DOMNodeAnchorSignature, type EditorAnchorSignature, type TimelineAnchorSignature } from './CommentThread.js';
export { type Comment, type CommentAnchorSignature, CommentThread, type CommentThreadOptions, type CommentThreadStatus, type DOMNodeAnchorSignature, type EditorAnchorSignature, type TimelineAnchorSignature, };
export declare const enum Events {
    COMMENT_THREADS_CHANGED = "CommentThreadsChanged",
    COMMENT_MODE_CHANGED = "CommentModeChanged",
    AGENT_ATTACHED_CHANGED = "AgentAttachedChanged"
}
export interface EventTypes {
    [Events.COMMENT_THREADS_CHANGED]: CommentThread[];
    [Events.COMMENT_MODE_CHANGED]: boolean;
    [Events.AGENT_ATTACHED_CHANGED]: boolean;
}
/**
 * Headless model managing comment thread data, CRUD operations, and comment mode.
 */
export declare class CommentManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor();
    setAgentAttached(value: boolean): void;
    isAgentAttached(): boolean;
    setCommentMode(active: boolean): void;
    isCommentMode(): boolean;
    createCommentThread(anchor: CommentAnchorSignature, text?: string, author?: 'DEVELOPER' | 'AGENT', isGeneratedComment?: boolean): CommentThread;
    getCommentThread(id: string): CommentThread | undefined;
    getCommentThreads(): CommentThread[];
    takeComments(): CommentThread[];
    sendQueuedThreads(): void;
    resolveCommentThread(threadId: string, replyText?: string): boolean;
    removeCommentThread(id: string): void;
    clear(): void;
}
