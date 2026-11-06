import type * as Api from './api/api.js';
export type { CacheEntry, CacheStorageLike, HostRuntime, ScreenshotOptions, Worker, WorkerMessageEvent, WorkerMessagePort, WorkerScope, WorkerTransferable, } from './api/HostRuntime.js';
export declare const IS_NODE: boolean;
export declare const IS_BROWSER: boolean;
export declare const HOST_RUNTIME: Api.HostRuntime.HostRuntime;
