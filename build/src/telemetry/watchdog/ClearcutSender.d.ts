/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChromeDevToolsMcpExtension, OsType } from '../types.js';
export interface ClearcutSenderConfig {
    appVersion: string;
    osType: OsType;
    clearcutEndpoint?: string;
    forceFlushIntervalMs?: number;
    includePidHeader?: boolean;
}
export declare class ClearcutSender {
    #private;
    constructor(config: ClearcutSenderConfig);
    enqueueEvent(event: ChromeDevToolsMcpExtension): void;
    sendShutdownEvent(): Promise<void>;
    stopForTesting(): void;
    get bufferSizeForTesting(): number;
}
