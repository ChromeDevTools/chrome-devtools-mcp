/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type TargetUniverse, SymbolizedError } from '../devtools/DevtoolsUtils.js';
import { UncaughtError } from '../collectors/PageCollector.js';
import * as DevTools from '../third_party/index.js';
import type { ConsoleMessage } from '../third_party/index.js';
import type { IssueFormatter } from './IssueFormatter.js';
export interface ConsoleFormatterOptions {
    fetchDetailedData?: boolean;
    fetchStackTrace?: boolean;
    id: number;
    devTools?: TargetUniverse;
    resolvedArgsForTesting?: unknown[];
    resolvedStackTraceForTesting?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
    resolvedCauseForTesting?: SymbolizedError;
    isIgnoredForTesting?: IgnoreCheck;
}
export type IgnoreCheck = (frame: DevTools.DevTools.StackTrace.StackTrace.Frame) => boolean;
interface ConsoleMessageConcise {
    type: string;
    text: string;
    argsCount: number;
    id: number;
    count?: number;
    stackTrace?: string;
}
interface ConsoleMessageDetailed extends ConsoleMessageConcise {
    args: string[];
    stackTrace?: string;
}
export declare class ConsoleFormatter {
    #private;
    readonly isIgnored: IgnoreCheck;
    protected constructor(params: {
        id: number;
        type: string;
        text: string;
        isIgnored: IgnoreCheck;
        argCount?: number;
        resolvedArgs?: unknown[];
        stack?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
        cause?: SymbolizedError;
        includeStackInConcise?: boolean;
    });
    static from(msg: ConsoleMessage | UncaughtError, options: ConsoleFormatterOptions): Promise<ConsoleFormatter>;
    toString(): string;
    toStringDetailed(): string;
    toJSON(): ConsoleMessageConcise;
    /**
     * Groups consecutive messages with the same type, text, and argument count.
     * Similar to Chrome DevTools' console grouping behavior.
     */
    static groupConsecutive(messages: Array<ConsoleFormatter | IssueFormatter>): Array<ConsoleFormatter | IssueFormatter>;
    toJSONDetailed(): ConsoleMessageDetailed;
}
export declare class GroupedConsoleFormatter extends ConsoleFormatter {
    #private;
    constructor(params: {
        id: number;
        type: string;
        text: string;
        argCount: number;
        isIgnored: IgnoreCheck;
        stack?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
        cause?: SymbolizedError;
        includeStackInConcise?: boolean;
    }, count: number);
    toString(): string;
    toJSON(): ConsoleMessageConcise;
}
export {};
