import type * as CommentManager from '../comment_manager/comment_manager.js';
export declare class ChangeTracker {
    #private;
    constructor(commentManager: CommentManager.CommentManager.CommentManager);
    get isTracking(): boolean;
    trackChange(description: string, anchor: CommentManager.CommentManager.CommentAnchorSignature): void;
}
