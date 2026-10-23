import * as Common from '../../core/common/common.js';
export interface EditorAnchorSignature {
    /** 1-based line number for CodeMirror text editor anchors */
    lineNumber: number;
    /** File path associated with the editor */
    filePath?: string;
}
export interface DOMNodeAnchorSignature {
    /** Backend NodeId for DOM nodes (`data-backend-node-id`) */
    backendNodeId: number;
    /** Target ID associated with the DOM node (`data-target-id`) */
    targetId: string;
}
export interface TimelineAnchorSignature {
    /** Identifier of the trace to scope comments to a specific recording */
    traceId: string;
    /** Serializable key from Trace.EventsSerializer (e.g. 'r-123', 'p-1-2-3-4', 's-5') */
    traceEventKey: string;
    /** Primary event title or category name */
    entryName: string;
    /** Event start timestamp in microseconds */
    startTimeMicro: number;
    /** Chart location */
    chartLocation: 'main' | 'network';
    /** Event duration in microseconds (omitted for instant markers) */
    durationMicro?: number;
}
export interface CommentAnchorSignature {
    /** Visual logging tree path, e.g. "Panel: elements > Pane: styles > TreeOutline > TreeItem: color" */
    vePath: string;
    /** Normalized text content of the target node */
    textSignature?: string;
    /** Text content of the parent container VE node for sibling disambiguation */
    parentTextSignature?: string;
    /** 0-indexed position among siblings sharing the same visual logging path */
    siblingIndex?: number;
    /** Optional backend RequestId for Network panel elements (`data-network-request-id`) */
    networkRequestId?: string;
    /** Optional DOM node identifiers (`data-backend-node-id`, `data-target-id`) */
    node?: DOMNodeAnchorSignature;
    /** Optional editor anchor coordinates for CodeMirror text editors */
    editor?: EditorAnchorSignature;
    /** Optional timeline flamechart anchor coordinates for Performance panel trace entries */
    timeline?: TimelineAnchorSignature;
}
export interface Comment {
    author: 'DEVELOPER' | 'AGENT';
    text: string;
    timestamp: number;
}
export type CommentThreadStatus = 'DRAFT' | 'ACTIVE' | 'SENT_TO_AGENT' | 'RESOLVED';
export declare const enum Events {
    CHANGED = "Changed"
}
export interface EventTypes {
    [Events.CHANGED]: void;
}
export interface CommentThreadOptions {
    anchor: CommentAnchorSignature;
    comments?: Comment[];
    /** True for comments generated from the change tracker. */
    isGeneratedComment?: boolean;
}
export declare class CommentThread extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    static resetIndex(): void;
    readonly id: string;
    readonly anchor: CommentAnchorSignature;
    /** True for comments generated from the change tracker. */
    readonly isGeneratedComment: boolean;
    comments: Comment[];
    status: CommentThreadStatus;
    transmitted: boolean;
    constructor(options: CommentThreadOptions);
    get index(): number;
    save(text?: string, author?: 'DEVELOPER' | 'AGENT'): void;
    editComment(text: string): void;
    sendToAgent(text?: string, author?: 'DEVELOPER' | 'AGENT'): void;
    resolve(replyText?: string): void;
}
