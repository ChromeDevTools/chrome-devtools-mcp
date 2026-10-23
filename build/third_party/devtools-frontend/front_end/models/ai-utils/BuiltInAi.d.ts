import * as Common from '../../core/common/common.js';
export interface LanguageModel {
    promptStreaming: (arg0: string, opts?: {
        signal?: AbortSignal;
    }) => AsyncGenerator<string>;
    clone: () => Promise<LanguageModel>;
    destroy: () => void;
}
export declare const enum LanguageModelAvailability {
    UNAVAILABLE = "unavailable",
    DOWNLOADABLE = "downloadable",
    DOWNLOADING = "downloading",
    AVAILABLE = "available",
    DISABLED = "disabled"
}
export declare class BuiltInAi extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    initDoneForTesting: Promise<void>;
    static instance(): BuiltInAi;
    constructor();
    getLanguageModelAvailability(): Promise<LanguageModelAvailability>;
    isDownloading(): boolean;
    isEventuallyAvailable(): boolean;
    getDownloadProgress(): number | null;
    startDownloadingModel(): void;
    hasSession(): boolean;
    initialize(): Promise<void>;
    static removeInstance(): void;
    getConsoleInsight(prompt: string, abortController: AbortController): AsyncGenerator<string>;
}
export declare const enum Events {
    DOWNLOAD_PROGRESS_CHANGED = "downloadProgressChanged",
    DOWNLOADED_AND_SESSION_CREATED = "downloadedAndSessionCreated"
}
export interface EventTypes {
    [Events.DOWNLOAD_PROGRESS_CHANGED]: number;
    [Events.DOWNLOADED_AND_SESSION_CREATED]: void;
}
