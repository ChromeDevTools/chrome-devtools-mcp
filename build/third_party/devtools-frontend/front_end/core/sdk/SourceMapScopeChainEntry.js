// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
var _a;
import * as i18n from '../i18n/i18n.js';
import { RemoteObjectImpl, RemoteObjectProperty } from './RemoteObject.js';
import { findExpression, scriptRelativePosition } from './SourceMapScopesInfo.js';
const UIStrings = {
    /**
     * @description Title of a section in the debugger showing local JavaScript variables.
     */
    local: 'Local',
    /**
     * @description Text that refers to closure as a programming term.
     */
    closure: 'Closure',
    /**
     * @description Noun that represents a section or block of code in the Debugger Model. Shown in the Sources tab, while paused on a breakpoint.
     */
    block: 'Block',
    /**
     * @description Title of a section in the debugger showing JavaScript variables from the global scope.
     */
    global: 'Global',
    /**
     * @description Text in Scope Chain section of the Sources panel.
     */
    exception: 'Exception',
    /**
     * @description Text in Scope Chain section of the Sources panel.
     */
    returnValue: 'Return value',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/SourceMapScopeChainEntry.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class SourceMapScopeChainEntry {
    #callFrame;
    #scope;
    #range;
    #isInnerMostFunction;
    #returnValue;
    #scopeNumber;
    #object;
    /**
     * @param isInnerMostFunction If `scope` is the innermost 'function' scope. Only used for labeling as we name the
     * scope of the paused function 'Local', while other outer 'function' scopes are named 'Closure'.
     * @param scopeNumber The V8 scope in which `scope`s binding expressions must be evaluated. Defaults to the
     * inner-most scope.
     */
    constructor(callFrame, scope, range, isInnerMostFunction, returnValue, scopeNumber) {
        this.#callFrame = callFrame;
        this.#scope = scope;
        this.#range = range;
        this.#isInnerMostFunction = isInnerMostFunction;
        this.#returnValue = returnValue;
        this.#scopeNumber = scopeNumber;
    }
    originalScope() {
        return this.#scope;
    }
    extraProperties() {
        const extraProperties = [];
        if (this.#isInnerMostFunction && this.#callFrame.exception) {
            extraProperties.push(new RemoteObjectProperty(i18nString(UIStrings.exception), this.#callFrame.exception, undefined, undefined, undefined, undefined, undefined, 
            /* synthetic */ true));
        }
        if (this.#returnValue) {
            extraProperties.push(new RemoteObjectProperty(i18nString(UIStrings.returnValue), this.#returnValue, undefined, undefined, undefined, undefined, undefined, 
            /* synthetic */ true, this.#callFrame.setReturnValue.bind(this.#callFrame)));
        }
        return extraProperties;
    }
    callFrame() {
        return this.#callFrame;
    }
    type() {
        if (this.#scope.isStackFrame) {
            return this.#isInnerMostFunction ? "local" /* Protocol.Debugger.ScopeType.Local */ : "closure" /* Protocol.Debugger.ScopeType.Closure */;
        }
        // `kind` is a free-form label. The spec encourages 'Global'/'Block' but doesn't mandate the casing.
        switch (this.#scope.kind?.toLowerCase()) {
            case 'global':
                return "global" /* Protocol.Debugger.ScopeType.Global */;
            case 'block':
                return "block" /* Protocol.Debugger.ScopeType.Block */;
        }
        return this.#scope.kind ?? '';
    }
    typeName() {
        if (this.#scope.isStackFrame) {
            return this.#isInnerMostFunction ? i18nString(UIStrings.local) : i18nString(UIStrings.closure);
        }
        switch (this.#scope.kind?.toLowerCase()) {
            case 'global':
                return i18nString(UIStrings.global);
            case 'block':
                return i18nString(UIStrings.block);
        }
        return this.#scope.kind ?? '';
    }
    name() {
        return this.#scope.name;
    }
    range() {
        return null;
    }
    object() {
        if (!this.#object) {
            this.#object = new SourceMapScopeRemoteObject(this.#callFrame, this.#scope, this.#range, this.#scopeNumber);
        }
        return this.#object;
    }
    description() {
        return '';
    }
    icon() {
        return undefined;
    }
}
class SourceMapScopeRemoteObject extends RemoteObjectImpl {
    #callFrame;
    #scope;
    #range;
    #scopeNumber;
    #propertiesPromise;
    #cachedWithPreview = false;
    constructor(callFrame, scope, range, scopeNumber) {
        super(callFrame.debuggerModel.runtimeModel(), /* objectId */ undefined, 'object', /* sub type */ undefined, 
        /* value */ null);
        this.#callFrame = callFrame;
        this.#scope = scope;
        this.#range = range;
        this.#scopeNumber = scopeNumber;
    }
    async doGetProperties(_ownProperties, accessorPropertiesOnly, _nonIndexedPropertiesOnly, generatePreview) {
        if (accessorPropertiesOnly) {
            return { properties: [], internalProperties: [] };
        }
        if (!this.#propertiesPromise || (generatePreview && !this.#cachedWithPreview)) {
            this.#cachedWithPreview = generatePreview;
            this.#propertiesPromise = this.#evaluateProperties(generatePreview);
        }
        return await this.#propertiesPromise;
    }
    async #evaluateProperties(generatePreview) {
        if (this.#scope.variables.length === 0) {
            return { properties: [], internalProperties: [] };
        }
        const expressions = this.#scope.variables.map((_, index) => this.#findExpression(index));
        const values = await this.#evaluateAsBatch(expressions, generatePreview) ??
            await this.#evaluateSeparately(expressions, generatePreview);
        const properties = this.#scope.variables.map((variable, index) => {
            const value = values[index];
            if (value === null) {
                return _a.#unavailableProperty(variable);
            }
            return new RemoteObjectProperty(variable, value, /* enumerable */ true, /* writable */ false, /* isOwn */ true, 
            /* wasThrown */ false);
        });
        return { properties, internalProperties: [] };
    }
    /**
     * Evaluates all binding expressions of this scope with a single `evaluateOnCallFrame` call.
     *
     * We build an object literal that spreads in one `{index: value}` object per binding, each produced by
     * its own arrow function wrapped in `try`/`catch`. A binding that throws contributes nothing, which is
     * how we tell it apart from one that legitimately evaluates to `undefined`, and it doesn't take the
     * rest of the scope down with it.
     *
     * The expressions are inlined rather than passed to `eval`. `eval` in the evaluated code is the page's
     * `eval`, which a `script-src` CSP without `'unsafe-eval'` blocks. `Runtime.evaluate` can opt out of
     * that via `allowUnsafeEvalBlockedByCSP`, but `Debugger.evaluateOnCallFrame` has no such option.
     * Inlining also means we don't introduce bindings of our own that could shadow the names a binding
     * expression refers to, and arrow functions keep `this` pointing at the paused frame's receiver.
     *
     * @returns The value for each expression, or null if the batch failed as a whole. The latter happens
     *          when a binding expression doesn't parse, since that takes out the entire object literal.
     */
    async #evaluateAsBatch(expressions, generatePreview) {
        const spreads = [];
        for (const [index, expression] of expressions.entries()) {
            if (expression !== null) {
                spreads.push(`...(() => { try { return {${index}: (${expression})}; } catch {} })()`);
            }
        }
        if (spreads.length === 0) {
            return expressions.map(() => null);
        }
        const result = await this.#callFrame.evaluate({
            expression: `({__proto__: null, ${spreads.join(', ')}})`,
            // The wrapper object is a throw-away. We only need previews for the values inside of it.
            generatePreview: false,
            scopeNumber: this.#scopeNumber,
        });
        if ('error' in result || result.exceptionDetails || !result.object) {
            return null;
        }
        const { properties } = await result.object.getOwnProperties(generatePreview);
        result.object.release();
        const valueByIndex = new Map(properties?.map(({ name, value }) => [name, value]));
        return expressions.map((_, index) => valueByIndex.get(String(index)) ?? null);
    }
    /**
     * Fallback for when {@link #evaluateAsBatch} fails as a whole, so that a single binding expression
     * that doesn't parse only costs us that one variable.
     */
    async #evaluateSeparately(expressions, generatePreview) {
        const values = [];
        for (const expression of expressions) {
            if (expression === null) {
                values.push(null);
                continue;
            }
            const result = await this.#callFrame.evaluate({ expression, generatePreview, scopeNumber: this.#scopeNumber });
            if ('error' in result || result.exceptionDetails) {
                // TODO(crbug.com/40277685): Make these errors user-visible to aid tooling developers.
                //         E.g. show the error on hover or expose it in the developer resources panel.
                values.push(null);
            }
            else {
                values.push(result.object);
            }
        }
        return values;
    }
    /** @returns null if the variable is unavailable at the current paused location */
    #findExpression(index) {
        const pausedLocation = this.#callFrame.location();
        const pausedPosition = pausedLocation ? scriptRelativePosition(pausedLocation) : undefined;
        return findExpression(this.#range, index, pausedPosition?.line, pausedPosition?.column);
    }
    static #unavailableProperty(name) {
        return new RemoteObjectProperty(name, null, /* enumerable */ true, /* writeable */ false, /* isOwn */ true, 
        /* wasThrown */ false);
    }
}
_a = SourceMapScopeRemoteObject;
//# sourceMappingURL=SourceMapScopeChainEntry.js.map