/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawn } from 'node:child_process';
import type { WatchdogMessage, OsType } from './types.js';
export declare class WatchdogClient {
    #private;
    constructor(config: {
        parentPid: number;
        appVersion: string;
        osType: OsType;
        logFile?: string;
        clearcutEndpoint?: string;
        clearcutForceFlushIntervalMs?: number;
        clearcutIncludePidHeader?: boolean;
    }, options?: {
        spawn?: typeof spawn;
    });
    send(message: WatchdogMessage): void;
}
