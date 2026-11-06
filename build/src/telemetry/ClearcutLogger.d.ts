/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { zod, ShapeOutput } from '../third_party/index.js';
import type { ErrorCode } from './errors.js';
import type { Persistence } from './persistence.js';
import { type FlagUsage } from './types.js';
import { WatchdogClient } from './WatchdogClient.js';
import type { DevToolsData } from '../tools/ToolDefinition.js';
export interface ClearcutLoggerOptions {
    appVersion: string;
    persistence: Persistence;
    logFile?: string;
    watchdogClient?: WatchdogClient;
    clearcutEndpoint?: string;
    clearcutForceFlushIntervalMs?: number;
    clearcutIncludePidHeader?: boolean;
}
export declare class ClearcutLogger {
    #private;
    static initialize(options: ClearcutLoggerOptions): ClearcutLogger;
    static get(): ClearcutLogger | undefined;
    static resetForTesting(): void;
    private constructor();
    setClientName(clientName: string): void;
    logToolInvocation(args: {
        toolName: string;
        params: ShapeOutput<zod.ZodRawShape>;
        schema: zod.ZodRawShape;
        success: boolean;
        latencyMs: number;
        devToolsData?: DevToolsData;
        pageUrl?: string;
    }): Promise<void>;
    logServerStart(flagUsage: FlagUsage): Promise<void>;
    logDailyActiveIfNeeded(): Promise<void>;
    logServerError(args: {
        errorCode: ErrorCode;
        toolName?: string;
    }): Promise<void>;
}
