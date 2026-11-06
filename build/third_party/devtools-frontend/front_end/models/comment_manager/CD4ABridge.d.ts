import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Logs from '../logs/logs.js';
import * as CommentManager from './CommentManager.js';
export interface CommentThread {
    id: string;
    text: string;
    networkRequestId?: string;
    node?: CommentManager.DOMNodeAnchorSignature;
}
export interface RevealTarget {
    networkRequestId?: string;
    node?: CommentManager.DOMNodeAnchorSignature;
}
export declare const enum Events {
    COMMENT_THREADS_CHANGED = "CommentThreadsChanged"
}
export interface EventTypes {
    [Events.COMMENT_THREADS_CHANGED]: void;
}
/**
 * Headless model bridge connecting DevTools comments subsystem to CD4A.
 * Provides serialization, transmission state tracking, and element reveal capabilities.
 */
export declare class CD4ABridge extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(commentManager: CommentManager.CommentManager, targetManager?: SDK.TargetManager.TargetManager, networkLog?: Logs.NetworkLog.NetworkLog, inspectorFrontendHost?: Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI);
    dispose(): void;
    getCommentThreads(): CommentThread[];
    setAgentAttached(value: boolean): void;
    resolveCommentThread(threadId: string, replyText?: string): boolean;
    reveal(panelName: string, target?: RevealTarget): Promise<void>;
}
