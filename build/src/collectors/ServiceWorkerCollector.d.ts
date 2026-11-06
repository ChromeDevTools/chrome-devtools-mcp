/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UncaughtError } from './PageCollector.js';
import type { ConsoleMessage, Target, Browser } from '../third_party/index.js';
import type { McpWorker } from '../McpWorker.js';
import { type WithSymbolId } from '../utils/id.js';
export declare class ServiceWorkerSubscriber {
    #private;
    constructor(target: Target, callback: (item: ConsoleMessage | UncaughtError) => void);
    subscribe(): Promise<void>;
    unsubscribe(): Promise<void>;
}
export declare class ServiceWorkerConsoleCollector {
    #private;
    constructor(browser?: Browser, maxLogs?: number);
    init(workers: McpWorker[]): Promise<void>;
    dispose(): void;
    addLog(extensionId: string, log: ConsoleMessage | UncaughtError): void;
    getData(extensionId: string): Array<WithSymbolId<ConsoleMessage | UncaughtError>>;
    getById(extensionId: string, stableId: number): WithSymbolId<ConsoleMessage | UncaughtError>;
    find(extensionId: string, filter: (item: WithSymbolId<ConsoleMessage | UncaughtError>) => boolean): WithSymbolId<ConsoleMessage | UncaughtError> | undefined;
    clearLogs(extensionId: string): void;
}
