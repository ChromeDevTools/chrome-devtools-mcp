// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Small utility class to build scope and range trees.
 *
 * This class allows construction of scope/range trees that will be rejected by the encoder.
 * Use this class if you guarantee proper nesting yourself and don't want to pay for the
 * checks, otherwise use the `SafeScopeInfoBuilder`.
 *
 * This class will also silently ignore calls that would fail otherwise. E.g. calling
 * `end*` without a matching `start*`.
 */
export class ScopeInfoBuilder {
    #scopes = [];
    #ranges = [];
    #currentSourceScopes = null;
    #scopeStack = [];
    #rangeStack = [];
    #knownScopes = new Set();
    #keyToScope = new Map();
    #lastScope = null;
    addNullSource() {
        this.#scopes.push(null);
        return this;
    }
    startSource() {
        this.#currentSourceScopes = [];
        return this;
    }
    endSource() {
        if (this.#currentSourceScopes) {
            this.#scopes.push(this.#currentSourceScopes);
            this.#currentSourceScopes = null;
        }
        return this;
    }
    startScope(line, column, options) {
        const scope = {
            start: { line, column },
            end: { line, column },
            variables: options?.variables?.slice(0) ?? [],
            children: [],
            isStackFrame: Boolean(options?.isStackFrame),
        };
        if (options?.name !== undefined)
            scope.name = options.name;
        if (options?.kind !== undefined)
            scope.kind = options.kind;
        if (this.#scopeStack.length > 0) {
            scope.parent = this.#scopeStack.at(-1);
        }
        this.#scopeStack.push(scope);
        this.#knownScopes.add(scope);
        if (options?.key !== undefined)
            this.#keyToScope.set(options.key, scope);
        return this;
    }
    setScopeName(name) {
        const scope = this.#scopeStack.at(-1);
        if (scope)
            scope.name = name;
        return this;
    }
    setScopeKind(kind) {
        const scope = this.#scopeStack.at(-1);
        if (scope)
            scope.kind = kind;
        return this;
    }
    setScopeStackFrame(isStackFrame) {
        const scope = this.#scopeStack.at(-1);
        if (scope)
            scope.isStackFrame = isStackFrame;
        return this;
    }
    setScopeVariables(variables) {
        const scope = this.#scopeStack.at(-1);
        if (scope)
            scope.variables = variables.slice(0);
        return this;
    }
    endScope(line, column) {
        const scope = this.#scopeStack.pop();
        if (!scope)
            return this;
        scope.end = { line, column };
        if (this.#scopeStack.length === 0) {
            this.#currentSourceScopes?.push(scope);
        }
        else {
            this.#scopeStack.at(-1).children.push(scope);
        }
        this.#lastScope = scope;
        return this;
    }
    /**
     * @returns The OriginalScope opened with the most recent `startScope` call, but not yet closed.
     */
    currentScope() {
        return this.#scopeStack.at(-1) ?? null;
    }
    /**
     * @returns The most recent OriginalScope closed with `endScope`.
     */
    lastScope() {
        return this.#lastScope;
    }
    /**
     * @param option The definition 'scope' of this range can either be the "OriginalScope" directly
     * (produced by this builder) or the scope's key set while building the scope.
     */
    startRange(line, column, options) {
        const range = {
            start: { line, column },
            end: { line, column },
            isStackFrame: Boolean(options?.isStackFrame),
            isHidden: Boolean(options?.isHidden),
            values: options?.values ?? [],
            children: [],
        };
        if (this.#rangeStack.length > 0) {
            range.parent = this.#rangeStack.at(-1);
        }
        if (options?.scope !== undefined) {
            range.originalScope = options.scope;
        }
        else if (options?.scopeKey !== undefined) {
            range.originalScope = this.#keyToScope.get(options.scopeKey);
        }
        if (options?.callSite) {
            range.callSite = options.callSite;
        }
        this.#rangeStack.push(range);
        return this;
    }
    setRangeDefinitionScope(scope) {
        const range = this.#rangeStack.at(-1);
        if (range)
            range.originalScope = scope;
        return this;
    }
    setRangeDefinitionScopeKey(scopeKey) {
        const range = this.#rangeStack.at(-1);
        if (range)
            range.originalScope = this.#keyToScope.get(scopeKey);
        return this;
    }
    setRangeStackFrame(isStackFrame) {
        const range = this.#rangeStack.at(-1);
        if (range)
            range.isStackFrame = isStackFrame;
        return this;
    }
    setRangeHidden(isHidden) {
        const range = this.#rangeStack.at(-1);
        if (range)
            range.isHidden = isHidden;
        return this;
    }
    setRangeValues(values) {
        const range = this.#rangeStack.at(-1);
        if (range)
            range.values = values;
        return this;
    }
    setRangeCallSite(callSite) {
        const range = this.#rangeStack.at(-1);
        if (range)
            range.callSite = callSite;
        return this;
    }
    endRange(line, column) {
        const range = this.#rangeStack.pop();
        if (!range)
            return this;
        range.end = { line, column };
        if (this.#rangeStack.length === 0) {
            this.#ranges.push(range);
        }
        else {
            this.#rangeStack.at(-1).children.push(range);
        }
        return this;
    }
    build() {
        const info = { scopes: this.#scopes, ranges: this.#ranges };
        this.#scopes = [];
        this.#ranges = [];
        this.#currentSourceScopes = null;
        this.#knownScopes.clear();
        this.#keyToScope.clear();
        this.#lastScope = null;
        return info;
    }
    get currentSourceScopes() {
        return this.#currentSourceScopes;
    }
    get scopeStack() {
        return this.#scopeStack;
    }
    get rangeStack() {
        return this.#rangeStack;
    }
    isKnownScope(scope) {
        return this.#knownScopes.has(scope);
    }
    isValidScopeKey(key) {
        return this.#keyToScope.has(key);
    }
    getScopeByValidKey(key) {
        return this.#keyToScope.get(key);
    }
}
//# sourceMappingURL=builder.js.map