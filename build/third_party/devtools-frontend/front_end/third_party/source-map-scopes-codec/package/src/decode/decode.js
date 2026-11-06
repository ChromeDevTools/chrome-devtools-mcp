// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { comparePositions } from "../util.js";
import { TokenIterator } from "../vlq.js";
/**
 * The mode decides how well-formed the encoded scopes have to be, to be accepted by the decoder.
 *
 * LAX is the default and is much more lenient. It's still best effort though and the decoder doesn't
 * implement any error recovery: e.g. superfluous "start" items can lead to whole trees being omitted.
 *
 * STRICT mode will throw in the following situations:
 *
 *   - Encountering ORIGINAL_SCOPE_END, or GENERATED_RANGE_END items that don't have matching *_START items.
 *   - Encountering ORIGINAL_SCOPE_VARIABLES items outside a surrounding scope START/END.
 *   - Encountering GENERATED_RANGE_BINDINGS items outside a surrounding range START/END.
 *   - Miss-matches between the number of variables in a scope vs the number of value expressions in the ranges.
 *   - GENERATED_RANGE_SUBRANGE_BINDING items whose variable index is out of bounds of the range's bindings.
 *   - Out-of-bound indices into the "names" array.
 *   - Index source maps with sections that are index source maps themselves.
 */
export var DecodeMode;
(function (DecodeMode) {
    DecodeMode[DecodeMode["STRICT"] = 1] = "STRICT";
    DecodeMode[DecodeMode["LAX"] = 2] = "LAX";
})(DecodeMode || (DecodeMode = {}));
export const DEFAULT_DECODE_OPTIONS = {
    mode: 2 /* DecodeMode.LAX */,
    generatedOffset: { line: 0, column: 0 },
};
export function decode(sourceMap, options = DEFAULT_DECODE_OPTIONS) {
    const opts = { ...DEFAULT_DECODE_OPTIONS, ...options };
    if ("sections" in sourceMap) {
        return decodeIndexMap(sourceMap, {
            ...opts,
            generatedOffset: { line: 0, column: 0 },
        });
    }
    return decodeMap(sourceMap, opts);
}
function decodeMap(sourceMap, options) {
    if ((!sourceMap.scopes && !sourceMap.ranges) || !sourceMap.names) {
        return { scopes: [], ranges: [], hasVariableAndBindingInfo: false };
    }
    return new Decoder(sourceMap.scopes ?? [], sourceMap.ranges ?? [], sourceMap.names, options).decode();
}
function decodeIndexMap(sourceMap, options) {
    const scopeInfo = {
        scopes: [],
        ranges: [],
        hasVariableAndBindingInfo: false,
    };
    for (const section of sourceMap.sections) {
        // Per spec, a section's "map" is a regular source map; nested index maps
        // are not allowed. Don't recurse, so maliciously deep nesting can't
        // overflow the stack.
        if ("sections" in section.map) {
            if (options.mode === 1 /* DecodeMode.STRICT */) {
                throw new Error("Index source map sections must not be index maps");
            }
            continue;
        }
        const { scopes, ranges, hasVariableAndBindingInfo } = decodeMap(section.map, { ...options, generatedOffset: section.offset });
        for (const scope of scopes)
            scopeInfo.scopes.push(scope);
        for (const range of ranges)
            scopeInfo.ranges.push(range);
        scopeInfo.hasVariableAndBindingInfo ||= hasVariableAndBindingInfo;
    }
    return scopeInfo;
}
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
class Decoder {
    #encodedScopes;
    #encodedRanges;
    #names;
    #mode;
    #generatedOffset;
    #scopes = [];
    #ranges = [];
    #scopeState = { ...DEFAULT_SCOPE_STATE };
    #rangeState = { ...DEFAULT_RANGE_STATE };
    #scopeStack = [];
    #rangeStack = [];
    #currentRootScopes = [];
    #flatOriginalScopes = [];
    #currentFlatScopes = [];
    #subRangeBindingsForRange = new Map();
    #seenOriginalScopeVariables = false;
    #seenGeneratedRangeBindings = false;
    constructor(scopes, ranges, names, options) {
        this.#encodedScopes = scopes;
        this.#encodedRanges = ranges;
        this.#names = names;
        this.#mode = options.mode;
        this.#generatedOffset = options.generatedOffset;
    }
    decode() {
        for (const encodedScope of this.#encodedScopes) {
            if (encodedScope === null) {
                this.#scopes.push(null);
                this.#flatOriginalScopes.push(null);
                continue;
            }
            this.#decodeScopes(encodedScope);
        }
        for (const encodedRange of this.#encodedRanges) {
            this.#decodeRanges(encodedRange);
        }
        const info = {
            scopes: this.#scopes,
            ranges: this.#ranges,
            hasVariableAndBindingInfo: this.#seenOriginalScopeVariables &&
                this.#seenGeneratedRangeBindings,
        };
        this.#scopes = [];
        this.#ranges = [];
        this.#currentRootScopes = [];
        this.#flatOriginalScopes = [];
        this.#currentFlatScopes = [];
        this.#seenOriginalScopeVariables = false;
        this.#seenGeneratedRangeBindings = false;
        return info;
    }
    #decodeScopes(encodedScope) {
        Object.assign(this.#scopeState, DEFAULT_SCOPE_STATE);
        this.#currentRootScopes = [];
        this.#currentFlatScopes = [];
        const iter = new TokenIterator(encodedScope, this.#mode === 1 /* DecodeMode.STRICT */);
        while (iter.hasNext()) {
            const tag = iter.nextUnsignedVLQ();
            switch (tag) {
                case 1 /* Tag.ORIGINAL_SCOPE_START */: {
                    const item = {
                        flags: iter.nextUnsignedVLQ(),
                        line: iter.nextUnsignedVLQ(),
                        column: iter.nextUnsignedVLQ(),
                    };
                    if (item.flags & 1 /* OriginalScopeFlags.HAS_NAME */) {
                        item.nameIdx = iter.nextSignedVLQ();
                    }
                    if (item.flags & 2 /* OriginalScopeFlags.HAS_KIND */) {
                        item.kindIdx = iter.nextSignedVLQ();
                    }
                    this.#handleOriginalScopeStartItem(item);
                    break;
                }
                case 3 /* Tag.ORIGINAL_SCOPE_VARIABLES */: {
                    const variableIdxs = [];
                    while (iter.hasNext() && iter.peek() !== ",") {
                        variableIdxs.push(iter.nextSignedVLQ());
                    }
                    this.#handleOriginalScopeVariablesItem(variableIdxs);
                    this.#seenOriginalScopeVariables = true;
                    break;
                }
                case 2 /* Tag.ORIGINAL_SCOPE_END */: {
                    this.#handleOriginalScopeEndItem(iter.nextUnsignedVLQ(), iter.nextUnsignedVLQ());
                    break;
                }
                case 21 /* Tag.VENDOR_EXTENSION */: {
                    const _extensionNameIdx = iter.nextUnsignedVLQ();
                    break;
                }
                default: {
                    this.#throwInStrictMode(`Encountered illegal item tag ${tag}`);
                    break;
                }
            }
            // Consume any trailing VLQ and the ","
            while (iter.hasNext() && iter.peek() !== ",")
                iter.nextUnsignedVLQ();
            if (iter.hasNext())
                iter.nextChar();
        }
        if (this.#scopeStack.length > 0) {
            this.#throwInStrictMode("Encountered ORIGINAL_SCOPE_START without matching END!");
            this.#scopeStack.length = 0;
        }
        this.#scopes.push(this.#currentRootScopes);
        this.#flatOriginalScopes.push(this.#currentFlatScopes);
    }
    #decodeRanges(encodedRanges) {
        Object.assign(this.#rangeState, DEFAULT_RANGE_STATE);
        this.#rangeState.line = this.#generatedOffset.line;
        this.#rangeState.column = this.#generatedOffset.column;
        const prevLastRange = this.#ranges.at(-1);
        const prevRangesLength = this.#ranges.length;
        const iter = new TokenIterator(encodedRanges, this.#mode === 1 /* DecodeMode.STRICT */);
        while (iter.hasNext()) {
            const tag = iter.nextUnsignedVLQ();
            switch (tag) {
                case 4 /* Tag.GENERATED_RANGE_START */: {
                    const flags = iter.nextUnsignedVLQ();
                    const line = flags & 1 /* GeneratedRangeFlags.HAS_LINE */
                        ? iter.nextUnsignedVLQ()
                        : undefined;
                    const column = iter.nextUnsignedVLQ();
                    let definition;
                    if (flags & 2 /* GeneratedRangeFlags.HAS_DEFINITION */) {
                        const sourceIdx = iter.nextSignedVLQ();
                        const scopeIdx = sourceIdx === 0
                            ? iter.nextSignedVLQ()
                            : iter.nextUnsignedVLQ();
                        definition = { sourceIdx, scopeIdx };
                    }
                    this.#handleGeneratedRangeStartItem({
                        flags,
                        line,
                        column,
                        definition,
                    });
                    break;
                }
                case 5 /* Tag.GENERATED_RANGE_END */: {
                    const lineOrColumn = iter.nextUnsignedVLQ();
                    const maybeColumn = iter.hasNext() && iter.peek() !== ","
                        ? iter.nextUnsignedVLQ()
                        : undefined;
                    if (maybeColumn !== undefined) {
                        this.#handleGeneratedRangeEndItem(lineOrColumn, maybeColumn);
                    }
                    else {
                        this.#handleGeneratedRangeEndItem(0, lineOrColumn);
                    }
                    break;
                }
                case 6 /* Tag.GENERATED_RANGE_BINDINGS */: {
                    const valueIdxs = [];
                    while (iter.hasNext() && iter.peek() !== ",") {
                        valueIdxs.push(iter.nextUnsignedVLQ());
                    }
                    this.#handleGeneratedRangeBindingsItem(valueIdxs);
                    this.#seenGeneratedRangeBindings = true;
                    break;
                }
                case 7 /* Tag.GENERATED_RANGE_SUBRANGE_BINDING */: {
                    const variableIndex = iter.nextUnsignedVLQ();
                    const bindings = [];
                    while (iter.hasNext() && iter.peek() !== ",") {
                        bindings.push([
                            iter.nextUnsignedVLQ(),
                            iter.nextUnsignedVLQ(),
                            iter.nextUnsignedVLQ(),
                        ]);
                    }
                    this.#recordGeneratedSubRangeBindingItem(variableIndex, bindings);
                    this.#seenGeneratedRangeBindings = true;
                    break;
                }
                case 8 /* Tag.GENERATED_RANGE_CALL_SITE */: {
                    this.#handleGeneratedRangeCallSite(iter.nextUnsignedVLQ(), iter.nextUnsignedVLQ(), iter.nextUnsignedVLQ());
                    break;
                }
                case 21 /* Tag.VENDOR_EXTENSION */: {
                    const _extensionNameIdx = iter.nextUnsignedVLQ();
                    break;
                }
                default: {
                    this.#throwInStrictMode(`Encountered illegal item tag ${tag}`);
                    break;
                }
            }
            // Consume any trailing VLQ and the ","
            while (iter.hasNext() && iter.peek() !== ",")
                iter.nextUnsignedVLQ();
            if (iter.hasNext())
                iter.nextChar();
        }
        if (this.#rangeStack.length > 0) {
            this.#throwInStrictMode("Encountered GENERATED_RANGE_START without matching END!");
            this.#rangeStack.length = 0;
        }
        if (prevLastRange &&
            this.#ranges.length > prevRangesLength &&
            comparePositions(this.#ranges[prevRangesLength].start, prevLastRange.end) <
                0) {
            this.#throwInStrictMode("Range segment starts before the previous segment ended!");
        }
    }
    #throwInStrictMode(message) {
        if (this.#mode === 1 /* DecodeMode.STRICT */)
            throw new Error(message);
    }
    #handleOriginalScopeStartItem(item) {
        this.#scopeState.line += item.line;
        if (item.line === 0) {
            this.#scopeState.column += item.column;
        }
        else {
            this.#scopeState.column = item.column;
        }
        const scope = {
            start: { line: this.#scopeState.line, column: this.#scopeState.column },
            end: { line: this.#scopeState.line, column: this.#scopeState.column },
            isStackFrame: false,
            variables: [],
            children: [],
        };
        if (item.nameIdx !== undefined) {
            this.#scopeState.name += item.nameIdx;
            scope.name = this.#resolveName(this.#scopeState.name);
        }
        if (item.kindIdx !== undefined) {
            this.#scopeState.kind += item.kindIdx;
            scope.kind = this.#resolveName(this.#scopeState.kind);
        }
        scope.isStackFrame = Boolean(item.flags & 4 /* OriginalScopeFlags.IS_STACK_FRAME */);
        this.#scopeStack.push(scope);
        this.#currentFlatScopes.push(scope);
    }
    #handleOriginalScopeVariablesItem(variableIdxs) {
        const scope = this.#scopeStack.at(-1);
        if (!scope) {
            this.#throwInStrictMode("Encountered ORIGINAL_SCOPE_VARIABLES without surrounding ORIGINAL_SCOPE_START");
            return;
        }
        for (const variableIdx of variableIdxs) {
            this.#scopeState.variable += variableIdx;
            scope.variables.push(this.#resolveName(this.#scopeState.variable));
        }
    }
    #handleOriginalScopeEndItem(line, column) {
        this.#scopeState.line += line;
        if (line === 0) {
            this.#scopeState.column += column;
        }
        else {
            this.#scopeState.column = column;
        }
        const scope = this.#scopeStack.pop();
        if (!scope) {
            this.#throwInStrictMode("Encountered ORIGINAL_SCOPE_END without matching ORIGINAL_SCOPE_START!");
            return;
        }
        scope.end = {
            line: this.#scopeState.line,
            column: this.#scopeState.column,
        };
        if (this.#scopeStack.length > 0) {
            const parent = this.#scopeStack.at(-1);
            scope.parent = parent;
            parent.children.push(scope);
        }
        else {
            this.#currentRootScopes.push(scope);
        }
    }
    #handleGeneratedRangeStartItem(item) {
        if (item.line !== undefined) {
            this.#rangeState.line += item.line;
            this.#rangeState.column = item.column;
        }
        else {
            this.#rangeState.column += item.column;
        }
        const range = {
            start: {
                line: this.#rangeState.line,
                column: this.#rangeState.column,
            },
            end: {
                line: this.#rangeState.line,
                column: this.#rangeState.column,
            },
            isStackFrame: Boolean(item.flags & 4 /* GeneratedRangeFlags.IS_STACK_FRAME */),
            isHidden: Boolean(item.flags & 8 /* GeneratedRangeFlags.IS_HIDDEN */),
            values: [],
            children: [],
        };
        if (item.definition !== undefined) {
            this.#rangeState.defSourceIdx += item.definition.sourceIdx;
            if (item.definition.sourceIdx !== 0) {
                this.#rangeState.defScopeIdx = 0;
            }
            this.#rangeState.defScopeIdx += item.definition.scopeIdx;
            const originalScope = this
                .#flatOriginalScopes[this.#rangeState.defSourceIdx]?.[this.#rangeState.defScopeIdx];
            if (!originalScope) {
                this.#throwInStrictMode("Invalid definition scope index");
            }
            else {
                range.originalScope = originalScope;
            }
        }
        this.#rangeStack.push(range);
    }
    #handleGeneratedRangeBindingsItem(valueIdxs) {
        const range = this.#rangeStack.at(-1);
        if (!range) {
            this.#throwInStrictMode("Encountered GENERATED_RANGE_BINDINGS without surrounding GENERATED_RANGE_START");
            return;
        }
        for (const valueIdx of valueIdxs) {
            if (valueIdx === 0) {
                range.values.push(null);
            }
            else {
                range.values.push(this.#resolveName(valueIdx - 1));
            }
        }
    }
    #recordGeneratedSubRangeBindingItem(variableIndex, bindings) {
        const range = this.#rangeStack.at(-1);
        if (!range) {
            this.#throwInStrictMode("Encountered GENERATED_RANGE_SUBRANGE_BINDING without surrounding GENERATED_RANGE_START");
            return;
        }
        let subRangeBindings = this.#subRangeBindingsForRange.get(range);
        if (!subRangeBindings) {
            subRangeBindings = new Map();
            this.#subRangeBindingsForRange.set(range, subRangeBindings);
        }
        if (subRangeBindings.has(variableIndex)) {
            this.#throwInStrictMode("Encountered multiple GENERATED_RANGE_SUBRANGE_BINDING items for the same variable");
            return;
        }
        subRangeBindings.set(variableIndex, bindings);
    }
    #handleGeneratedRangeCallSite(sourceIndex, line, column) {
        const range = this.#rangeStack.at(-1);
        if (!range) {
            this.#throwInStrictMode("Encountered GENERATED_RANGE_CALL_SITE without surrounding GENERATED_RANGE_START");
            return;
        }
        range.callSite = {
            sourceIndex,
            line,
            column,
        };
    }
    #handleGeneratedRangeEndItem(line, column) {
        if (line !== 0) {
            this.#rangeState.line += line;
            this.#rangeState.column = column;
        }
        else {
            this.#rangeState.column += column;
        }
        const range = this.#rangeStack.pop();
        if (!range) {
            this.#throwInStrictMode("Encountered GENERATED_RANGE_END without matching GENERATED_RANGE_START!");
            return;
        }
        range.end = {
            line: this.#rangeState.line,
            column: this.#rangeState.column,
        };
        this.#handleGeneratedRangeSubRangeBindings(range);
        if (this.#rangeStack.length > 0) {
            const parent = this.#rangeStack.at(-1);
            range.parent = parent;
            parent.children.push(range);
        }
        else {
            this.#ranges.push(range);
        }
    }
    #handleGeneratedRangeSubRangeBindings(range) {
        const subRangeBindings = this.#subRangeBindingsForRange.get(range);
        if (!subRangeBindings)
            return;
        for (const [variableIndex, bindings] of subRangeBindings) {
            // Sub-range bindings can only refine an existing binding from the
            // GENERATED_RANGE_BINDINGS item. Writing to an arbitrary (attacker
            // controlled) index would turn `range.values` into a huge sparse array.
            if (variableIndex < 0 || variableIndex >= range.values.length) {
                this.#throwInStrictMode("GENERATED_RANGE_SUBRANGE_BINDING variable index out of bounds");
                continue;
            }
            const value = range.values[variableIndex];
            const subRanges = [];
            range.values[variableIndex] = subRanges;
            let lastLine = range.start.line;
            let lastColumn = range.start.column;
            subRanges.push({
                from: { line: lastLine, column: lastColumn },
                to: { line: 0, column: 0 },
                value: value,
            });
            for (const [line, column, binding] of bindings) {
                lastLine += line;
                if (line === 0) {
                    lastColumn += column;
                }
                else {
                    lastColumn = column;
                }
                subRanges.push({
                    from: { line: lastLine, column: lastColumn },
                    to: { line: 0, column: 0 }, // This will be fixed in the post-processing step.
                    value: binding === 0 ? undefined : this.#resolveName(binding - 1),
                });
            }
        }
        for (const value of range.values) {
            if (Array.isArray(value)) {
                const subRanges = value;
                for (let i = 0; i < subRanges.length - 1; ++i) {
                    subRanges[i].to = subRanges[i + 1].from;
                }
                subRanges[subRanges.length - 1].to = range.end;
            }
        }
    }
    #resolveName(index) {
        if (index < 0 || index >= this.#names.length) {
            this.#throwInStrictMode("Illegal index into the 'names' array");
        }
        return this.#names[index] ?? "";
    }
}
//# sourceMappingURL=decode.js.map