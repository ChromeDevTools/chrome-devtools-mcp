// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { encodeSigned, encodeUnsigned } from "../vlq.js";
import { comparePositions } from "../util.js";
const DEFAULT_SCOPE_STATE = {
    line: 0,
    column: 0,
    name: 0,
    kind: 0,
    variable: 0,
};
const DEFAULT_RANGE_STATE = {
    line: 0,
    column: 0,
    defSourceIdx: 0,
    defScopeIdx: 0,
};
export class Encoder {
    #info;
    #names;
    // Hash map to resolve indices of strings in the "names" array. Otherwise we'd have
    // to use 'indexOf' for every name we want to encode.
    #namesToIndex = new Map();
    #scopeState = { ...DEFAULT_SCOPE_STATE };
    #rangeState = { ...DEFAULT_RANGE_STATE };
    #encodedItems = [];
    #currentItem = "";
    #scopeToLocation = new Map();
    #currentSourceIdx = 0;
    #scopeCounter = 0;
    constructor(info, names) {
        this.#info = info;
        this.#names = names;
        for (let i = 0; i < names.length; ++i) {
            this.#namesToIndex.set(names[i], i);
        }
    }
    encode() {
        const encodedScopes = this.#info.scopes.map((scopes, sourceIdx) => {
            if (scopes === null) {
                return null;
            }
            this.#encodedItems = [];
            this.#currentSourceIdx = sourceIdx;
            this.#scopeCounter = 0;
            Object.assign(this.#scopeState, DEFAULT_SCOPE_STATE);
            scopes.forEach((scope) => this.#encodeOriginalScope(scope));
            return this.#encodedItems.join(",");
        });
        this.#encodedItems = [];
        this.#info.ranges.forEach((range) => {
            this.#encodeGeneratedRange(range);
        });
        return {
            scopes: encodedScopes,
            ranges: this.#encodedItems.length > 0
                ? [this.#encodedItems.join(",")]
                : [],
        };
    }
    #encodeOriginalScope(scope) {
        this.#encodeOriginalScopeStart(scope);
        this.#encodeOriginalScopeVariables(scope);
        scope.children.forEach((child) => this.#encodeOriginalScope(child));
        this.#encodeOriginalScopeEnd(scope);
    }
    #encodeOriginalScopeStart(scope) {
        const { line, column } = scope.start;
        this.#verifyPositionWithScopeState(line, column);
        let flags = 0;
        const encodedLine = line - this.#scopeState.line;
        const encodedColumn = encodedLine === 0
            ? column - this.#scopeState.column
            : column;
        this.#scopeState.line = line;
        this.#scopeState.column = column;
        let encodedName;
        if (scope.name !== undefined) {
            flags |= 1 /* OriginalScopeFlags.HAS_NAME */;
            const nameIdx = this.#resolveNamesIdx(scope.name);
            encodedName = nameIdx - this.#scopeState.name;
            this.#scopeState.name = nameIdx;
        }
        let encodedKind;
        if (scope.kind !== undefined) {
            flags |= 2 /* OriginalScopeFlags.HAS_KIND */;
            const kindIdx = this.#resolveNamesIdx(scope.kind);
            encodedKind = kindIdx - this.#scopeState.kind;
            this.#scopeState.kind = kindIdx;
        }
        if (scope.isStackFrame)
            flags |= 4 /* OriginalScopeFlags.IS_STACK_FRAME */;
        this.#encodeTag("B" /* EncodedTag.ORIGINAL_SCOPE_START */).#encodeUnsigned(flags)
            .#encodeUnsigned(encodedLine).#encodeUnsigned(encodedColumn);
        if (encodedName !== undefined)
            this.#encodeSigned(encodedName);
        if (encodedKind !== undefined)
            this.#encodeSigned(encodedKind);
        this.#finishItem();
        this.#scopeToLocation.set(scope, {
            sourceIdx: this.#currentSourceIdx,
            scopeIdx: this.#scopeCounter++,
        });
    }
    #encodeOriginalScopeVariables(scope) {
        if (scope.variables.length === 0)
            return;
        this.#encodeTag("D" /* EncodedTag.ORIGINAL_SCOPE_VARIABLES */);
        for (const variable of scope.variables) {
            const idx = this.#resolveNamesIdx(variable);
            this.#encodeSigned(idx - this.#scopeState.variable);
            this.#scopeState.variable = idx;
        }
        this.#finishItem();
    }
    #encodeOriginalScopeEnd(scope) {
        const { line, column } = scope.end;
        this.#verifyPositionWithScopeState(line, column);
        const encodedLine = line - this.#scopeState.line;
        const encodedColumn = encodedLine === 0
            ? column - this.#scopeState.column
            : column;
        this.#scopeState.line = line;
        this.#scopeState.column = column;
        this.#encodeTag("C" /* EncodedTag.ORIGINAL_SCOPE_END */).#encodeUnsigned(encodedLine)
            .#encodeUnsigned(encodedColumn).#finishItem();
    }
    #encodeGeneratedRange(range) {
        this.#encodeGeneratedRangeStart(range);
        this.#encodeGeneratedRangeBindings(range);
        this.#encodeGeneratedRangeSubRangeBindings(range);
        this.#encodeGeneratedRangeCallSite(range);
        range.children.forEach((child) => this.#encodeGeneratedRange(child));
        this.#encodeGeneratedRangeEnd(range);
    }
    #encodeGeneratedRangeStart(range) {
        const { line, column } = range.start;
        this.#verifyPositionWithRangeState(line, column);
        let flags = 0;
        const encodedLine = line - this.#rangeState.line;
        let encodedColumn = column - this.#rangeState.column;
        if (encodedLine > 0) {
            flags |= 1 /* GeneratedRangeFlags.HAS_LINE */;
            encodedColumn = column;
        }
        this.#rangeState.line = line;
        this.#rangeState.column = column;
        let encodedDefSourceIdx;
        let encodedDefScopeIdx;
        if (range.originalScope) {
            const location = this.#scopeToLocation.get(range.originalScope);
            if (location === undefined) {
                throw new Error("Unknown OriginalScope for definition!");
            }
            flags |= 2 /* GeneratedRangeFlags.HAS_DEFINITION */;
            encodedDefSourceIdx = location.sourceIdx - this.#rangeState.defSourceIdx;
            this.#rangeState.defSourceIdx = location.sourceIdx;
            encodedDefScopeIdx = encodedDefSourceIdx === 0
                ? location.scopeIdx - this.#rangeState.defScopeIdx
                : location.scopeIdx;
            this.#rangeState.defScopeIdx = location.scopeIdx;
        }
        if (range.isStackFrame)
            flags |= 4 /* GeneratedRangeFlags.IS_STACK_FRAME */;
        if (range.isHidden)
            flags |= 8 /* GeneratedRangeFlags.IS_HIDDEN */;
        this.#encodeTag("E" /* EncodedTag.GENERATED_RANGE_START */).#encodeUnsigned(flags);
        if (encodedLine > 0)
            this.#encodeUnsigned(encodedLine);
        this.#encodeUnsigned(encodedColumn);
        if (encodedDefSourceIdx !== undefined && encodedDefScopeIdx !== undefined) {
            this.#encodeSigned(encodedDefSourceIdx);
            if (encodedDefSourceIdx === 0) {
                this.#encodeSigned(encodedDefScopeIdx);
            }
            else {
                this.#encodeUnsigned(encodedDefScopeIdx);
            }
        }
        this.#finishItem();
    }
    #encodeGeneratedRangeSubRangeBindings(range) {
        if (range.values.length === 0)
            return;
        for (let i = 0; i < range.values.length; ++i) {
            const value = range.values[i];
            if (!Array.isArray(value) || value.length <= 1) {
                continue;
            }
            this.#encodeTag("H" /* EncodedTag.GENERATED_RANGE_SUBRANGE_BINDING */)
                .#encodeUnsigned(i);
            let lastLine = range.start.line;
            let lastColumn = range.start.column;
            for (let j = 1; j < value.length; ++j) {
                const subRange = value[j];
                const prevSubRange = value[j - 1];
                if (comparePositions(prevSubRange.to, subRange.from) !== 0) {
                    throw new Error("Sub-range bindings must not have gaps");
                }
                const encodedLine = subRange.from.line - lastLine;
                const encodedColumn = encodedLine === 0
                    ? subRange.from.column - lastColumn
                    : subRange.from.column;
                if (encodedLine < 0 || encodedColumn < 0) {
                    throw new Error("Sub-range bindings must be sorted");
                }
                lastLine = subRange.from.line;
                lastColumn = subRange.from.column;
                const binding = subRange.value === undefined
                    ? 0
                    : this.#resolveNamesIdx(subRange.value) + 1;
                this.#encodeUnsigned(encodedLine).#encodeUnsigned(encodedColumn)
                    .#encodeUnsigned(binding);
            }
            this.#finishItem();
        }
    }
    #encodeGeneratedRangeBindings(range) {
        if (range.values.length === 0)
            return;
        if (!range.originalScope) {
            throw new Error("Range has binding expressions but no OriginalScope");
        }
        else if (range.originalScope.variables.length !== range.values.length) {
            throw new Error("Range's binding expressions don't match OriginalScopes' variables");
        }
        this.#encodeTag("G" /* EncodedTag.GENERATED_RANGE_BINDINGS */);
        for (const val of range.values) {
            if (val === null || val === undefined) {
                this.#encodeUnsigned(0);
            }
            else if (typeof val === "string") {
                this.#encodeUnsigned(this.#resolveNamesIdx(val) + 1);
            }
            else {
                const initialValue = val[0];
                const binding = initialValue.value === undefined
                    ? 0
                    : this.#resolveNamesIdx(initialValue.value) + 1;
                this.#encodeUnsigned(binding);
            }
        }
        this.#finishItem();
    }
    #encodeGeneratedRangeCallSite(range) {
        if (!range.callSite)
            return;
        const { sourceIndex, line, column } = range.callSite;
        // TODO: Throw if stackFrame flag is set or OriginalScope index is invalid or no generated range is here.
        this.#encodeTag("I" /* EncodedTag.GENERATED_RANGE_CALL_SITE */).#encodeUnsigned(sourceIndex).#encodeUnsigned(line).#encodeUnsigned(column).#finishItem();
    }
    #encodeGeneratedRangeEnd(range) {
        const { line, column } = range.end;
        this.#verifyPositionWithRangeState(line, column);
        let flags = 0;
        const encodedLine = line - this.#rangeState.line;
        let encodedColumn = column - this.#rangeState.column;
        if (encodedLine > 0) {
            flags |= 1 /* GeneratedRangeFlags.HAS_LINE */;
            encodedColumn = column;
        }
        this.#rangeState.line = line;
        this.#rangeState.column = column;
        this.#encodeTag("F" /* EncodedTag.GENERATED_RANGE_END */);
        if (encodedLine > 0)
            this.#encodeUnsigned(encodedLine);
        this.#encodeUnsigned(encodedColumn).#finishItem();
    }
    #resolveNamesIdx(name) {
        const index = this.#namesToIndex.get(name);
        if (index !== undefined)
            return index;
        const addedIndex = this.#names.length;
        this.#names.push(name);
        this.#namesToIndex.set(name, addedIndex);
        return addedIndex;
    }
    #verifyPositionWithScopeState(line, column) {
        if (this.#scopeState.line > line ||
            (this.#scopeState.line === line && this.#scopeState.column > column)) {
            throw new Error(`Attempting to encode scope item (${line}, ${column}) that precedes the last encoded scope item (${this.#scopeState.line}, ${this.#scopeState.column})`);
        }
    }
    #verifyPositionWithRangeState(line, column) {
        if (this.#rangeState.line > line ||
            (this.#rangeState.line === line && this.#rangeState.column > column)) {
            throw new Error(`Attempting to encode range item that precedes the last encoded range item (${line}, ${column})`);
        }
    }
    #encodeTag(tag) {
        this.#currentItem += tag;
        return this;
    }
    #encodeSigned(n) {
        this.#currentItem += encodeSigned(n);
        return this;
    }
    #encodeUnsigned(n) {
        this.#currentItem += encodeUnsigned(n);
        return this;
    }
    #finishItem() {
        this.#encodedItems.push(this.#currentItem);
        this.#currentItem = "";
    }
}
//# sourceMappingURL=encoder.js.map