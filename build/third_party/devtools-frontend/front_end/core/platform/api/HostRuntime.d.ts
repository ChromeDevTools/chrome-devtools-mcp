export interface ScreenshotOptions {
    base64Png: string;
    fileName: string;
    clip?: {
        screenRectWidth: number;
        screenRectHeight: number;
        visiblePageRectLeft: number;
        visiblePageRectTop: number;
    };
}
export interface CacheEntry {
    put(url: string, response: Response): Promise<void>;
    match(url: string): Promise<Response | undefined>;
}
export interface CacheStorageLike {
    open(name: string): Promise<CacheEntry>;
    delete(name: string): Promise<boolean>;
}
/**
 * Provides abstractions for host features that require different implementations depending
 * on whether DevTools runs in the browser or Node.js
 */
export interface HostRuntime {
    createWorker(url: string): Worker;
    workerScope: WorkerScope;
    getOnLine(): boolean;
    getUserAgent(): string;
    getLocalStorage(): Storage | undefined;
    getCacheStorage(): CacheStorageLike | undefined;
    getDevicePixelRatio(): number;
    saveScreenshot(options: ScreenshotOptions): Promise<void>;
    copyScreenshot(options: ScreenshotOptions): Promise<void>;
    revokeLastScreenshotUrl(): void;
    loadTextFile(url: URL): Promise<string>;
    evaluateCSS(dataValue: string | null, customExpr: string): string | null;
    removeCSSEvaluationElement(): void;
}
/**
 * Abstracts away the differences between browser web workers and Node.js worker threads.
 */
export interface Worker {
    postMessage(message: unknown, transfer?: WorkerTransferable[]): void;
    dispose(): void;
    terminate(immediately?: boolean): void;
    set onmessage(listener: (event: WorkerMessageEvent) => void);
    set onerror(listener: (event: any) => void);
}
export type WorkerMessagePort = typeof MessagePort.prototype;
/**
 * Currently we only transfer MessagePorts to workers, but it's possible to add
 * more things (like ReadableStream) as long as it's present in all runtimes.
 */
export type WorkerTransferable = WorkerMessagePort;
/**
 * Used by workers to communicate with their parent.
 */
export interface WorkerScope {
    postMessage(message: unknown, transfer?: WorkerTransferable[]): void;
    set onmessage(listener: (event: WorkerMessageEvent) => Promise<void> | void);
}
export interface WorkerMessageEvent<T = any> {
    readonly data: T;
    ports: readonly WorkerMessagePort[];
}
