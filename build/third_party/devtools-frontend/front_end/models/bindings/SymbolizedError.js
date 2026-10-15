// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as StackTrace from '../stack_trace/stack_trace.js';
import { LiveLocationPool } from './LiveLocation.js';
export function isErrorLike(stack) {
    return /\n\s*at\s/.test(stack) || stack.startsWith('SyntaxError:');
}
export class UnparsableError extends Common.ObjectWrapper.ObjectWrapper {
    errorStack;
    cause;
    constructor(errorStack, cause) {
        super();
        this.errorStack = errorStack;
        this.cause = cause;
        this.cause?.addEventListener("UPDATED" /* Events.UPDATED */, this.#fireUpdated, this);
    }
    dispose() {
        this.cause?.removeEventListener("UPDATED" /* Events.UPDATED */, this.#fireUpdated, this);
        if (this.cause instanceof SymbolizedErrorObject || this.cause instanceof UnparsableError) {
            this.cause.dispose();
        }
    }
    #fireUpdated() {
        this.dispatchEventToListeners("UPDATED" /* Events.UPDATED */);
    }
}
export class SymbolizedErrorObject extends Common.ObjectWrapper.ObjectWrapper {
    message;
    stackTrace;
    cause;
    #syntaxErrorLocation = null;
    constructor(message, stackTrace, cause) {
        super();
        this.message = message;
        this.stackTrace = stackTrace;
        this.cause = cause;
        this.stackTrace.addEventListener("UPDATED" /* StackTrace.StackTrace.Events.UPDATED */, this.#fireUpdated, this);
        this.cause?.addEventListener("UPDATED" /* Events.UPDATED */, this.#fireUpdated, this);
    }
    dispose() {
        this.stackTrace.removeEventListener("UPDATED" /* StackTrace.StackTrace.Events.UPDATED */, this.#fireUpdated, this);
        this.cause?.removeEventListener("UPDATED" /* Events.UPDATED */, this.#fireUpdated, this);
        if (this.cause instanceof SymbolizedErrorObject || this.cause instanceof UnparsableError) {
            this.cause.dispose();
        }
    }
    get syntaxErrorLocation() {
        return this.#syntaxErrorLocation;
    }
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
    static async createForSyntaxError(target, debuggerWorkspaceBinding, message, exceptionDetails, stackTrace, cause) {
        const { exception, scriptId, lineNumber, columnNumber } = exceptionDetails;
        if (!exception || exception.subtype !== 'error' || exception.className !== 'SyntaxError') {
            throw new Error('SymbolizedErrorObject.createForSyntaxError expects a SyntaxError');
        }
        const symbolizedError = new SymbolizedErrorObject(message, stackTrace, cause);
        if (!scriptId) {
            return symbolizedError;
        }
        const topFrame = exceptionDetails.stackTrace?.callFrames[0];
        const isProgrammaticThrow = topFrame && topFrame.scriptId === scriptId && topFrame.lineNumber === lineNumber &&
            topFrame.columnNumber === columnNumber;
        if (!isProgrammaticThrow) {
            const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
            if (debuggerModel) {
                const rawLocation = debuggerModel.createRawLocationByScriptId(scriptId, lineNumber, columnNumber);
                // We don't implement dispose here. We won't create many of these so a couple
                // LiveLocationPools and SymbolizedErrorObject instances leaking is fine.
                await debuggerWorkspaceBinding.createLiveLocation(rawLocation, symbolizedError.#updateSyntaxErrorLocation.bind(symbolizedError), new LiveLocationPool());
            }
        }
        return symbolizedError;
    }
    async #updateSyntaxErrorLocation(liveLocation) {
        this.#syntaxErrorLocation = await liveLocation.uiLocation();
        this.dispatchEventToListeners("UPDATED" /* Events.UPDATED */);
    }
    #fireUpdated() {
        this.dispatchEventToListeners("UPDATED" /* Events.UPDATED */);
    }
}
//# sourceMappingURL=SymbolizedError.js.map