/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools, type CDPSession, type ConsoleMessage, type Protocol } from '../third_party/index.js';
/**
 * A mock implementation of an issues manager that only implements the methods
 * that are actually used by the IssuesAggregator
 */
export declare class FakeIssuesManager extends DevTools.Common.ObjectWrapper
    .ObjectWrapper<DevTools.IssuesManagerEventTypes> {
    issues(): DevTools.Issue[];
}
export declare function overrideDevToolsGlobals({ loadResource, }: {
    loadResource: (url: string) => Promise<string>;
}): void;
export interface TargetUniverse {
    /** The DevTools target corresponding to the puppeteer Page */
    target: DevTools.Target;
    universe: DevTools.Foundation.Universe.Universe;
    /** The secondary session created for this page */
    session: CDPSession;
}
export interface CreateTargetUniverseOptions {
    sourceMaps?: boolean;
}
export declare function createTargetUniverse(session: CDPSession, options?: CreateTargetUniverseOptions): Promise<TargetUniverse>;
export type RemoteObjectLike = Protocol.Runtime.RemoteObject | DevTools.Protocol.Runtime.RemoteObject;
export type ExceptionDetailsLike = Protocol.Runtime.ExceptionDetails | DevTools.Protocol.Runtime.ExceptionDetails;
export type StackTraceLike = Protocol.Runtime.StackTrace | DevTools.Protocol.Runtime.StackTrace;
/**
 * Constructed from Runtime.ExceptionDetails of an uncaught error.
 *
 * TODO: Also construct from a RemoteObject of subtype 'error'.
 *
 * Consists of the message, a fully resolved stack trace and a fully resolved 'cause' chain.
 */
export declare class SymbolizedError {
    #private;
    readonly message: string;
    readonly stackTrace?: DevTools.StackTrace.StackTrace.StackTrace;
    readonly cause?: SymbolizedError;
    private constructor();
    static fromDetails(opts: {
        details: ExceptionDetailsLike;
        targetId: string;
        devTools?: TargetUniverse;
        session?: CDPSession;
        includeStackAndCause?: boolean;
        resolvedStackTraceForTesting?: DevTools.StackTrace.StackTrace.StackTrace;
        resolvedCauseForTesting?: SymbolizedError;
    }): Promise<SymbolizedError>;
    static fromError(opts: {
        error: RemoteObjectLike;
        targetId: string;
        devTools?: TargetUniverse;
        session?: CDPSession;
    }): Promise<SymbolizedError>;
    static createForTesting(message: string, stackTrace?: DevTools.StackTrace.StackTrace.StackTrace, cause?: SymbolizedError): SymbolizedError;
}
export declare function createStackTraceForConsoleMessage(devTools: TargetUniverse, consoleMessage: ConsoleMessage): Promise<DevTools.StackTrace.StackTrace.StackTrace | undefined>;
export declare function createStackTrace(devTools: TargetUniverse, rawStackTrace: StackTraceLike, targetId: string | undefined): Promise<DevTools.StackTrace.StackTrace.StackTrace>;
