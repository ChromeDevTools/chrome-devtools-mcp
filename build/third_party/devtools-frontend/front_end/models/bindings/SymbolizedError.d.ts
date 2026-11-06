import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import * as StackTrace from '../stack_trace/stack_trace.js';
import type * as Workspace from '../workspace/workspace.js';
import type { DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
export declare function isErrorLike(stack: string): boolean;
export type SymbolizedError = SymbolizedErrorObject | UnparsableError;
export declare class UnparsableError extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    readonly errorStack: string;
    readonly cause: SymbolizedError | null;
    constructor(errorStack: string, cause: SymbolizedError | null);
    dispose(): void;
}
export declare class SymbolizedErrorObject extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    readonly message: string;
    readonly stackTrace: StackTrace.StackTrace.ParsedErrorStackTrace;
    readonly cause: SymbolizedError | null;
    constructor(message: string, stackTrace: StackTrace.StackTrace.ParsedErrorStackTrace, cause: SymbolizedError | null);
    dispose(): void;
    get syntaxErrorLocation(): Workspace.UISourceCode.UILocation | null;
    /**
     * Evaluates if we should populate the `syntaxErrorLocation` based on the provided exception details.
     *
     * There are three primary cases for SyntaxError:
     * 1. Programmatic `SyntaxError`: Thrown via `throw new SyntaxError('...', {cause: ...})`. Has a full stack trace,
     *    and an optional cause. The exception details point to the `throw` statement, which is identical to the top frame.
     *    We do NOT want to populate `syntaxErrorLocation` here to avoid redundant location rendering in the UI.
     * 2. Script parse failure: Failed to parse a script. Has no stack trace but possesses a compile-time location.
     *    We DO want to populate `syntaxErrorLocation` to highlight where the parse failed.
     * 3. `eval` parse failure: Failed to parse an eval string. Has a stack trace pointing to the `eval` call site
     *    and a compile-time location of the parse failure within the string. The exception details location differs
     *    from the top frame. We DO want to populate `syntaxErrorLocation` here.
     */
    static createForSyntaxError(target: SDK.Target.Target, debuggerWorkspaceBinding: DebuggerWorkspaceBinding, message: string, exceptionDetails: Protocol.Runtime.ExceptionDetails, stackTrace: StackTrace.StackTrace.ParsedErrorStackTrace, cause: SymbolizedError | null): Promise<SymbolizedErrorObject>;
}
export declare const enum Events {
    UPDATED = "UPDATED"
}
export interface EventTypes {
    [Events.UPDATED]: void;
}
