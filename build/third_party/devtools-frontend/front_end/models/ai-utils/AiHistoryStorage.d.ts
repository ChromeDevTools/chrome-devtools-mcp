import * as Common from '../../core/common/common.js';
export declare const enum ConversationType {
    NONE = "none",
    STYLING = "freestyler",
    FILE = "drjones-file",
    NETWORK = "drjones-network-request",
    PERFORMANCE = "drjones-performance-full",
    ACCESSIBILITY = "accessibility",
    STORAGE = "storage"
}
export type SerializedResponseItem = Record<string, any>;
export interface SerializedConversation {
    id: string;
    type: ConversationType;
    history: SerializedResponseItem[];
}
export interface SerializedImage {
    id: string;
    mimeType: string;
    data: string;
}
export declare const MAX_RECENT_PROMPTS_COUNT = 20;
export declare const MAX_CONVERSATIONS_COUNT = 50;
export declare const RECENT_PROMPTS_SIZE_LIMIT: number;
export declare const enum Events {
    HISTORY_DELETED = "AiHistoryDeleted"
}
export interface EventTypes {
    [Events.HISTORY_DELETED]: void;
}
export declare class AiHistoryStorage extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(settings?: Common.Settings.Settings, maxStorageSize?: number);
    clearForTest(): void;
    addRecentPrompt(prompt: string): Promise<void>;
    getRecentPrompts(): string[];
    upsertHistoryEntry(agentEntry: SerializedConversation): Promise<void>;
    upsertImage(image: SerializedImage): Promise<void>;
    deleteHistoryEntry(id: string): Promise<void>;
    deleteAll(): Promise<void>;
    getHistory(): SerializedConversation[];
    getImageHistory(): SerializedImage[];
    static instance(opts?: {
        forceNew: boolean;
        maxStorageSize?: number;
        settings?: Common.Settings.Settings;
    }): AiHistoryStorage;
    static removeInstance(): void;
}
