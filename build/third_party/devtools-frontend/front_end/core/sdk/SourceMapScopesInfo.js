// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Formatter from '../../models/formatter/formatter.js';
import { SourceMapScopeChainEntry } from './SourceMapScopeChainEntry.js';
export class SourceMapScopesInfo {
    #sourceMap;
    #originalScopes;
    #generatedRanges;
    /** Whether the scope information was derived from the AST and mappings (see {@link createFromAst}). */
    #isFromAst;
    #cachedVariablesAndBindingsPresent = null;
    constructor(sourceMap, scopeInfo, { isFromAst = false } = {}) {
        this.#sourceMap = sourceMap;
        this.#originalScopes = scopeInfo.scopes;
        this.#generatedRanges = scopeInfo.ranges;
        this.#isFromAst = isFromAst;
    }
    /**
     * If the source map does not contain any scopes information, this factory function attempts to create scope information
     * via the script's AST combined with the mappings.
     *
     * We create the generated ranges from the scope tree and for each range we create an original scope that matches the bounds 1:1.
     */
    static createFromAst(sourceMap, scopeTree, text) {
        const numSourceUrls = sourceMap.sourceURLs().length;
        const scopesBySourceUrl = Array.from({ length: numSourceUrls }, () => []);
        // Convert the entire scopeTree. Returns a root range that encompasses everything,
        // and inserts scopes by sourceIndex into the above scopesBySourceUrl.
        const stack = [{ node: scopeTree }];
        let rootRange = undefined;
        while (stack.length > 0) {
            const popped = stack.pop();
            if (!popped) {
                break;
            }
            const { node, parentRange, parentScopeHint } = popped;
            const start = positionFromOffset(node.start);
            const end = positionFromOffset(node.end);
            const startEntry = sourceMap.findEntry(start.line, start.column);
            const endEntry = sourceMap.findEntry(end.line, end.column);
            const sourceIndex = startEntry?.sourceIndex;
            const canMapOriginalPosition = startEntry && endEntry && sourceIndex !== undefined &&
                startEntry.sourceIndex === endEntry.sourceIndex && startEntry.sourceIndex !== undefined && sourceIndex >= 0 &&
                sourceIndex < numSourceUrls;
            const isStackFrame = node.kind === 2 /* Formatter.FormatterWorkerPool.ScopeKind.FUNCTION */ ||
                node.kind === 4 /* Formatter.FormatterWorkerPool.ScopeKind.ARROW_FUNCTION */;
            let name = undefined;
            for (const offset of node.nameMappingLocations ?? []) {
                const position = positionFromOffset(offset);
                const entry = sourceMap.findEntryExact(position.line, position.column);
                if (entry?.name !== undefined) {
                    // Only consider named mappings.
                    name = entry.name;
                    break;
                }
            }
            let scope;
            if (canMapOriginalPosition) {
                scope = {
                    start: { line: startEntry.sourceLineNumber, column: startEntry.sourceColumnNumber },
                    end: { line: endEntry.sourceLineNumber, column: endEntry.sourceColumnNumber },
                    name: name ?? node.name,
                    isStackFrame,
                    variables: [],
                    children: [],
                };
            }
            const range = {
                start,
                end,
                originalScope: scope,
                isStackFrame,
                isHidden: false,
                values: [],
                children: [],
            };
            if (!rootRange) {
                rootRange = range;
            }
            parentRange?.children.push(range);
            let nextParentScopeHint = parentScopeHint;
            if (canMapOriginalPosition && scope) {
                const startParent = (parentScopeHint && containsOriginal(parentScopeHint, scope)) ? parentScopeHint : undefined;
                insertInScope(sourceIndex, startParent, scope);
                nextParentScopeHint = scope;
            }
            for (let i = node.children.length - 1; i >= 0; --i) {
                stack.push({ node: node.children[i], parentRange: range, parentScopeHint: nextParentScopeHint });
            }
        }
        return new SourceMapScopesInfo(sourceMap, { scopes: scopesBySourceUrl, ranges: rootRange ? [rootRange] : [] }, { isFromAst: true });
        /**
         * Finds the correct place in the tree to insert the new scope.
         * Maintains the invariant that children are sorted and contained by their parent.
         */
        function insertInScope(sourceIndex, parent, newScope) {
            let children = parent ? parent.children : scopesBySourceUrl[sourceIndex];
            // Check if the newScope fits strictly inside any of the existing children.
            // We iterate to find the deepest parent to avoid Maximum Call Stack Size Exceeded
            // errors on highly nested scripts.
            while (true) {
                let deeperParent = null;
                for (const child of children) {
                    if (containsOriginal(child, newScope)) {
                        deeperParent = child;
                        break;
                    }
                }
                if (deeperParent) {
                    parent = deeperParent;
                    children = deeperParent.children;
                }
                else {
                    break;
                }
            }
            // When here, newScope belongs directly in parent (or at the root of the source file).
            // However, newScope might encompass some of the existing children (due
            // to compiler transform quirks or arbitrary insertion order). We must move
            // those children inside newScope.
            const childrenToKeep = [];
            for (const child of children) {
                if (containsOriginal(newScope, child)) {
                    // child is actually inside newScope, so re-parent it.
                    newScope.children.push(child);
                    child.parent = newScope;
                }
                else {
                    childrenToKeep.push(child);
                }
            }
            // Find the correct index in the remaining children to insert newScope.
            // We look for the first child that starts after the new scope.
            const insertIndex = childrenToKeep.findIndex(child => compareScopes(newScope, child) < 0);
            if (insertIndex === -1) {
                // If no child starts after, it goes at the end.
                childrenToKeep.push(newScope);
            }
            else {
                childrenToKeep.splice(insertIndex, 0, newScope);
            }
            // Update parent's children (or root scopes) to only be the ones that don't belong to newScope.
            if (parent) {
                parent.children = childrenToKeep;
            }
            else {
                scopesBySourceUrl[sourceIndex] = childrenToKeep;
            }
            newScope.parent = parent;
        }
        function containsOriginal(outer, inner) {
            return comparePositions(outer.start, inner.start) <= 0 && comparePositions(outer.end, inner.end) >= 0;
        }
        function compareScopes(a, b) {
            return comparePositions(a.start, b.start);
        }
        function positionFromOffset(offset) {
            const location = text.positionFromOffset(offset);
            return { line: location.lineNumber, column: location.columnNumber };
        }
    }
    addOriginalScopes(scopes) {
        for (const scope of scopes) {
            this.#originalScopes.push(scope);
        }
    }
    addGeneratedRanges(ranges) {
        for (const range of ranges) {
            this.#generatedRanges.push(range);
        }
    }
    hasOriginalScopes(sourceIdx) {
        return Boolean(this.#originalScopes[sourceIdx]?.length);
    }
    isEmpty() {
        const noScopes = this.#originalScopes.every(scopes => scopes === null || scopes.length === 0);
        return noScopes && !this.#generatedRanges.length;
    }
    hasGeneratedRanges() {
        return this.#generatedRanges.length > 0;
    }
    addOriginalScopesAtIndex(sourceIdx, scopes) {
        if (!this.#originalScopes[sourceIdx]?.length) {
            this.#originalScopes[sourceIdx] = scopes;
        }
        else {
            throw new Error(`Trying to re-augment existing scopes for source at index: ${sourceIdx}`);
        }
    }
    #generatedFrameKind(rangeChain) {
        const functionRange = rangeChain.findLast(range => range.isStackFrame);
        if (!functionRange) {
            // Top-level code.
            return "VISIBLE" /* GeneratedFrameKind.VISIBLE */;
        }
        if (!functionRange.originalScope) {
            // For scope information derived from the AST, we merely failed to map the function.
            return this.#isFromAst ? "VISIBLE" /* GeneratedFrameKind.VISIBLE */ : "HIDDEN" /* GeneratedFrameKind.HIDDEN */;
        }
        return functionRange.isHidden ? "OUTLINED" /* GeneratedFrameKind.OUTLINED */ : "VISIBLE" /* GeneratedFrameKind.VISIBLE */;
    }
    /**
     * Given a generated position, this returns all the surrounding generated ranges from outer
     * to inner. When `inlineFrameIndex > 0`, drops inner ranges up to the specified virtual
     * call frame.
     */
    #findGeneratedRangeChain(line, column, inlineFrameIndex = 0) {
        const result = [];
        (function walkRanges(ranges) {
            for (const range of ranges) {
                if (!contains(range, line, column)) {
                    continue;
                }
                result.push(range);
                walkRanges(range.children);
            }
        })(this.#generatedRanges);
        // Drop ranges in the chain until we reach our desired inlined range.
        for (let inlineIndex = 0; inlineIndex < inlineFrameIndex;) {
            const range = result.pop();
            if (!range) {
                break;
            }
            if (range.callSite) {
                ++inlineIndex;
            }
        }
        return result;
    }
    /**
     * @returns true if we have enough info (i.e. variable and binding expressions) to build
     * a scope view.
     */
    hasVariablesAndBindings() {
        if (this.#cachedVariablesAndBindingsPresent === null) {
            this.#cachedVariablesAndBindingsPresent = this.#areVariablesAndBindingsPresent();
        }
        return this.#cachedVariablesAndBindingsPresent;
    }
    #areVariablesAndBindingsPresent() {
        // We check whether any original scope has a non-empty list of variables, and
        // generated ranges with a non-empty binding list.
        function walkTree(nodes) {
            for (const node of nodes) {
                if ('variables' in node && node.variables.length > 0) {
                    return true;
                }
                if ('values' in node && node.values.some(v => v !== null)) {
                    return true;
                }
                if (walkTree(node.children)) {
                    return true;
                }
            }
            return false;
        }
        return this.#originalScopes.some(scopes => scopes !== null && walkTree(scopes)) && walkTree(this.#generatedRanges);
    }
    /**
     * Constructs a scope chain based on the CallFrame's paused position.
     *
     * The algorithm to obtain the original scope chain is straight-forward:
     *
     *   1) Find the inner-most generated range that contains the CallFrame's
     *      paused position.
     *
     *   2) Does the found range have an associated original scope?
     *
     *      2a) If no, return null. This is a "hidden" range and technically
     *          we shouldn't be pausing here in the first place. This code doesn't
     *          correspond to anything in the authored code.
     *
     *      2b) If yes, the associated original scope is the inner-most
     *          original scope in the resulting scope chain.
     *
     *   3) Walk the parent chain of the found original scope outwards. This is
     *      our scope view. For each original scope we also try to find a
     *      corresponding generated range that contains the CallFrame's
     *      paused position. We need the generated range to resolve variable
     *      values.
     */
    resolveMappedScopeChain(callFrame) {
        const rangeChain = this.#findGeneratedRangeChainForFrame(callFrame);
        const innerMostOriginalScope = rangeChain.at(-1)?.originalScope;
        if (innerMostOriginalScope === undefined) {
            return null;
        }
        // TODO(crbug.com/40277685): Add a sanity check here where we map the paused position using
        //         the source map's mappings, find the inner-most original scope with that mapped paused
        //         position and compare that result with `innerMostOriginalScope`. If they don't match we
        //         should emit a warning about the broken source map as mappings and scopes are inconsistent
        //         w.r.t. each other.
        let seenFunctionScope = false;
        const result = [];
        // Walk the original scope chain outwards and try to find the corresponding generated range along the way.
        for (let originalScope = innerMostOriginalScope; originalScope; originalScope = originalScope.parent) {
            const range = rangeChain.findLast(r => r.originalScope === originalScope);
            // `kind` is just a label for scope UI views and has no semantic significance, so `isStackFrame`
            // decides whether this scope is a function scope.
            const isFunctionScope = originalScope.isStackFrame;
            const isInnerMostFunction = isFunctionScope && !seenFunctionScope;
            const returnValue = isInnerMostFunction ? callFrame.returnValue() : null;
            const scopeNumber = range ? findMatchingScopeNumber(callFrame, range) : undefined;
            result.push(new SourceMapScopeChainEntry(callFrame, originalScope, range, isInnerMostFunction, returnValue ?? undefined, scopeNumber));
            seenFunctionScope ||= isFunctionScope;
        }
        const globalScope = callFrame.scopeChain()?.find(s => s.type() === "global" /* Protocol.Debugger.ScopeType.Global */);
        if (globalScope) {
            result.push(globalScope);
        }
        // If we are paused on a return statement, we need to drop inner block scopes. This is because V8 only emits a
        // single return bytecode and "gotos" at the functions' end, where we are now paused.
        if (callFrame.returnValue() !== null) {
            while (result.length && result[0].type() !== "local" /* Protocol.Debugger.ScopeType.Local */) {
                result.shift();
            }
        }
        return result;
    }
    #findGeneratedRangeChainForFrame(callFrame) {
        const { line, column } = scriptRelativePosition(callFrame.location());
        return this.#findGeneratedRangeChain(line, column, callFrame.inlineFrameIndex);
    }
    resolveMappedVariablesAtPosition(line, column, ignoreInnerBlockScopes = false, inlineFrameIndex = 0) {
        const rangeChain = this.#findGeneratedRangeChain(line, column, inlineFrameIndex);
        const startScope = rangeChain.at(-1)?.originalScope;
        const innerMostScope = (startScope && ignoreInnerBlockScopes && this.#findFunctionScopeInOriginalScopeChain(startScope)) || startScope;
        const result = [];
        for (let scope = innerMostScope; scope; scope = scope.parent) {
            const range = rangeChain.findLast(r => r.originalScope === scope);
            result.push(new Map(scope.variables.map((v, i) => [v, findExpression(range, i, line, column)])));
        }
        return innerMostScope ? result : null;
    }
    /**
     * Returns the authored function name of the function containing the provided generated position.
     */
    findOriginalFunctionName(position) {
        const originalInnerMostScope = this.findOriginalFunctionScope(position)?.scope;
        return this.#findFunctionNameInOriginalScopeChain(originalInnerMostScope);
    }
    /**
     * Returns the authored function scope of the function containing the provided generated position.
     */
    findOriginalFunctionScope(position) {
        const rangeChain = this.#findGeneratedRangeChain(position.line, position.column);
        const functionScope = this.#findFunctionScopeInOriginalScopeChain(this.#innerMostOriginalScope(rangeChain, position));
        return functionScope ? { scope: functionScope, url: this.#sourceURLOfScope(functionScope) } : null;
    }
    /**
     * Returns the inner-most original scope containing the generated `position`. `rangeChain` must be the generated
     * range chain of `position`.
     */
    #innerMostOriginalScope(rangeChain, position) {
        // There are 2 approaches:
        //   1) Find the inner-most generated range containing the provided generated position
        //      and use its OriginalScope.
        //   2) Use the mappings to turn the generated position into an original position.
        //      Then find the inner-most original scope containing that original position.
        //
        // Both approaches should yield the same result (assuming the mappings are spec compliant
        // w.r.t. generated ranges). But in the case of "pasta" scopes and extension provided
        // scope info, we only have the OriginalScope parts and mappings without GeneratedRanges.
        if (this.#generatedRanges.length > 0) {
            return rangeChain.at(-1)?.originalScope;
        }
        // No GeneratedRanges. Try to use mappings.
        const entry = this.#sourceMap.findEntry(position.line, position.column);
        if (entry?.sourceIndex === undefined) {
            return undefined;
        }
        return this
            .#findOriginalScopeChain({ sourceIndex: entry.sourceIndex, line: entry.sourceLineNumber, column: entry.sourceColumnNumber })
            .at(-1);
    }
    /** @returns the URL of the original source that `scope` belongs to. */
    #sourceURLOfScope(scope) {
        // Find the root scope for some given original source, to get the source url.
        let rootScope = scope;
        while (rootScope.parent) {
            rootScope = rootScope.parent;
        }
        const sourceIndex = this.#originalScopes.findIndex(scopes => scopes?.includes(rootScope));
        return sourceIndex !== -1 ? this.#sourceMap.sourceURLForSourceIndex(sourceIndex) : undefined;
    }
    /**
     * Given an original position, this returns all the surrounding original scopes from outer
     * to inner.
     */
    #findOriginalScopeChain({ sourceIndex, line, column }) {
        const scopes = this.#originalScopes[sourceIndex];
        if (!scopes) {
            return [];
        }
        const result = [];
        (function walkScopes(scopes) {
            for (const scope of scopes) {
                if (!contains(scope, line, column)) {
                    continue;
                }
                result.push(scope);
                walkScopes(scope.children);
            }
        })(scopes);
        return result;
    }
    #findFunctionScopeInOriginalScopeChain(innerOriginalScope) {
        for (let originalScope = innerOriginalScope; originalScope; originalScope = originalScope.parent) {
            if (originalScope.isStackFrame) {
                return originalScope;
            }
        }
        return null;
    }
    #findFunctionNameInOriginalScopeChain(innerOriginalScope) {
        const functionScope = this.#findFunctionScopeInOriginalScopeChain(innerOriginalScope);
        if (!functionScope) {
            return null;
        }
        return functionScope.name ?? '';
    }
    /**
     * Translates a single "raw frame" or call-site, including outlined functions. It's the caller's responsibility to
     * merge outlined frames with their caller(s) (see {@link GeneratedFrameKind}).
     */
    translateRawFrame(generatedLine, generatedColumn) {
        const rangeChain = this.#findGeneratedRangeChain(generatedLine, generatedColumn);
        const kind = this.#generatedFrameKind(rangeChain);
        if (kind === "HIDDEN" /* GeneratedFrameKind.HIDDEN */) {
            return { kind, frames: [] };
        }
        const frame = this.#translateTopFrame(generatedLine, generatedColumn, rangeChain);
        return { kind, frames: frame ? [frame, ...this.#translateInlinedCallers(rangeChain)] : [] };
    }
    /**
     * The top-most frame is translated the same, regardless of whether we have inlined functions: The name is the
     * original function surrounding the generated position, and the location is the mapped generated position.
     *
     * If the generated position has no mapping, the generated ranges may still tell which authored function (or
     * which file, for top-level code) the position belongs to. The frame then has no position.
     */
    #translateTopFrame(generatedLine, generatedColumn, rangeChain) {
        const position = { line: generatedLine, column: generatedColumn };
        const innerMostScope = this.#innerMostOriginalScope(rangeChain, position);
        const functionScope = this.#findFunctionScopeInOriginalScopeChain(innerMostScope);
        const name = functionScope ? (functionScope.name ?? '') : undefined;
        const mapping = this.#sourceMap.findEntry(generatedLine, generatedColumn);
        if (mapping?.sourceIndex !== undefined) {
            return {
                line: mapping.sourceLineNumber,
                column: mapping.sourceColumnNumber,
                name,
                url: mapping.sourceURL,
                functionStart: functionScope?.start,
            };
        }
        if (!innerMostScope) {
            return null;
        }
        return { name, url: this.#sourceURLOfScope(functionScope ?? innerMostScope), functionStart: functionScope?.start };
    }
    /**
     * Walk the range chain inside out until we find a generated function and for each inlined function add a frame.
     */
    #translateInlinedCallers(rangeChain) {
        const result = [];
        for (let i = rangeChain.length - 1; i >= 0 && !rangeChain[i].isStackFrame; --i) {
            const range = rangeChain[i];
            if (!range.callSite) {
                continue;
            }
            const originalScopeChain = this.#findOriginalScopeChain(range.callSite);
            const functionScope = this.#findFunctionScopeInOriginalScopeChain(originalScopeChain.at(-1));
            result.push({
                line: range.callSite.line,
                column: range.callSite.column,
                name: functionScope ? (functionScope.name ?? '') : undefined,
                url: this.#sourceMap.sourceURLForSourceIndex(range.callSite.sourceIndex),
                functionStart: functionScope?.start,
            });
        }
        return result;
    }
    /**
     * @returns the body of the innermost inlined function at the position (the innermost range with a `callSite`
     *          within the generated function), or null if the position is not inside an inlined function.
     *
     * The innermost inlined function is the logical frame the position belongs to, i.e. the analogue of the top frame
     * of a real call stack. Stepping over its body therefore goes up exactly one logical frame: into the caller, which
     * may itself be inlined. An outer range would leave several logical frames at once.
     */
    inlinedFunctionRange(generatedLine, generatedColumn) {
        const rangeChain = this.#findGeneratedRangeChain(generatedLine, generatedColumn);
        for (let i = rangeChain.length - 1; i >= 0 && !rangeChain[i].isStackFrame; --i) {
            if (rangeChain[i].callSite) {
                return { start: rangeChain[i].start, end: rangeChain[i].end };
            }
        }
        return null;
    }
    /**
     * @returns the bodies of all functions that were inlined directly into the logical function at the position
     *          (the innermost inlined function, or else the generated function). Doesn't descend into inlined
     *          functions or nested generated functions.
     */
    inlinedCalleeRanges(generatedLine, generatedColumn) {
        const rangeChain = this.#findGeneratedRangeChain(generatedLine, generatedColumn);
        let body;
        for (let i = rangeChain.length - 1; i >= 0 && !body; --i) {
            if (rangeChain[i].callSite || rangeChain[i].isStackFrame) {
                body = rangeChain[i];
            }
        }
        const result = [];
        (function walk(range) {
            for (const child of range.children) {
                if (child.isStackFrame) {
                    continue;
                }
                if (child.callSite) {
                    result.push({ start: child.start, end: child.end });
                }
                else {
                    walk(child);
                }
            }
        })(body ?? { children: this.#generatedRanges });
        return result;
    }
    /**
     * @returns the outlined parts of the authored function at the position: the hidden generated functions whose
     *          original scope lies within that function's original scope (see {@link GeneratedFrameKind.OUTLINED}),
     *          but not within a nested authored function. Includes the outlined part the position itself is in, if
     *          any. Sorted by start position.
     */
    outlinedFunctionRanges(generatedLine, generatedColumn) {
        const rangeChain = this.#findGeneratedRangeChain(generatedLine, generatedColumn);
        const functionScope = this.#findFunctionScopeInOriginalScopeChain(rangeChain.at(-1)?.originalScope);
        if (!functionScope) {
            return [];
        }
        const result = [];
        const walk = (ranges) => {
            for (const range of ranges) {
                if (range.isStackFrame && range.isHidden && range.originalScope &&
                    this.#findFunctionScopeInOriginalScopeChain(range.originalScope) === functionScope) {
                    result.push({ start: range.start, end: range.end });
                }
                walk(range.children);
            }
        };
        walk(this.#generatedRanges);
        return result;
    }
    /**
     * @returns the "artificial" generated functions (in the DWARF sense): functions that contain no authored code at all
     *          (no original scope anywhere in their subtree), e.g. compiler helpers. Sorted by start position,
     *          non-overlapping.
     */
    artificialFunctionRanges() {
        const hasOriginalScope = (range) => range.originalScope !== undefined || range.children.some(hasOriginalScope);
        const result = [];
        (function walk(ranges) {
            for (const range of ranges) {
                if (range.isStackFrame && !hasOriginalScope(range)) {
                    result.push({ start: range.start, end: range.end });
                }
                else {
                    walk(range.children);
                }
            }
        })(this.#generatedRanges);
        return result;
    }
}
export function findExpression(range, index, line = 0, column = 0) {
    const val = range?.values[index];
    return (typeof val === 'string' ? val : val?.find(r => contains({ start: r.from, end: r.to }, line, column))?.value) ??
        null;
}
export function contains(range, line, column) {
    if (range.start.line > line || (range.start.line === line && range.start.column > column)) {
        return false;
    }
    if (range.end.line < line || (range.end.line === line && range.end.column <= column)) {
        return false;
    }
    return true;
}
export function comparePositions(a, b) {
    if (a.line !== b.line) {
        return a.line - b.line;
    }
    return a.column - b.column;
}
/**
 * Converts a raw V8 {@link location} into a generated position relative to the start of its script.
 *
 * Positions in source maps (mappings and generated ranges) are relative to the start of the script,
 * while V8 reports locations in inline `<script>`s (without `//# sourceURL`) relative to the start of
 * the surrounding document.
 */
export function scriptRelativePosition(location) {
    const { lineNumber, columnNumber } = location.script()?.rawLocationToRelativeLocation(location) ?? location;
    return { line: lineNumber, column: columnNumber };
}
function positionRange(callFrame, scope) {
    const range = scope.range();
    if (range === null || range.start.scriptId !== callFrame.location().scriptId ||
        range.end.scriptId !== callFrame.location().scriptId) {
        return null;
    }
    return {
        start: scriptRelativePosition(range.start),
        end: scriptRelativePosition(range.end),
    };
}
/**
 * Finds the V8 scope that corresponds to the source map's generated `range`.
 *
 * We need this to evaluate a scope's binding expressions in the right V8 scope. `evaluateOnCallFrame`
 * defaults to the inner-most scope, where declarations shadow the outer variables we actually want to read.
 *
 * V8's scope ranges and the source map's generated ranges don't have to agree (in particular with
 * inlining), so besides an exact match we accept the outer-most V8 scope contained in `range` (a generated
 * range for a function spans the whole function text, while V8's scope only covers params + body), or
 * failing that the inner-most V8 scope containing `range`.
 *
 * @returns The scope number, or `undefined` if nothing matched. Callers should then omit `scopeNumber`
 *          and let CDP default to the inner-most scope.
 */
export function findMatchingScopeNumber(callFrame, range) {
    const scopeChain = callFrame.scopeChain();
    const exactMatch = scopeChain.find(scope => {
        const scopeRange = positionRange(callFrame, scope);
        return scopeRange !== null && comparePositions(scopeRange.start, range.start) === 0 &&
            comparePositions(scopeRange.end, range.end) === 0;
    });
    if (exactMatch !== undefined) {
        return exactMatch.ordinal();
    }
    // A stack frame must correspond to a V8 function scope. Inlined ranges make it easy to accidentally
    // land on an unrelated block/catch/with scope, so search the function scopes first.
    if (range.isStackFrame) {
        const functionScopes = scopeChain.filter(scope => scope.type() === "local" /* Protocol.Debugger.ScopeType.Local */ ||
            scope.type() === "closure" /* Protocol.Debugger.ScopeType.Closure */);
        const functionScope = findBestScope(callFrame, functionScopes, range);
        if (functionScope !== undefined) {
            return functionScope.ordinal();
        }
    }
    return findBestScope(callFrame, scopeChain, range)?.ordinal();
}
/**
 * @param scopes Ordered inner-most to outer-most.
 * @returns The outer-most scope contained in `range`, or if there is none, the inner-most scope
 *          containing `range`.
 */
function findBestScope(callFrame, scopes, range) {
    let outerMostContainedScope;
    let innerMostContainingScope;
    for (const scope of scopes) {
        const scopeRange = positionRange(callFrame, scope);
        if (scopeRange === null) {
            continue;
        }
        const rangeContainsScope = comparePositions(range.start, scopeRange.start) <= 0 && comparePositions(scopeRange.end, range.end) <= 0;
        const scopeContainsRange = comparePositions(scopeRange.start, range.start) <= 0 && comparePositions(range.end, scopeRange.end) <= 0;
        if (rangeContainsScope) {
            outerMostContainedScope = scope;
        }
        else if (scopeContainsRange) {
            innerMostContainingScope ??= scope;
        }
    }
    return outerMostContainedScope ?? innerMostContainingScope;
}
//# sourceMappingURL=SourceMapScopesInfo.js.map