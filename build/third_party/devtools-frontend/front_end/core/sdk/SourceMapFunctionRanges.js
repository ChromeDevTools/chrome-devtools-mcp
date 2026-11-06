// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { TokenIterator } from './SourceMap.js';
/**
 * Turns a list of {@link NamedFunctionRange}s into a list of {@link OriginalScope} trees nested
 * according to the start/end position. Each range is turned into an OriginalScope with the `isStackFrame`
 * bit set to denote it as a function and a generic "Function" label.
 *
 * `ranges` can be unsorted but will be sorted in-place.
 *
 * @throws if the ranges are not nested properly. Concretely: start < end for each range, and no
 * "straddling" (i.e. partially overlapping ranges).
 */
export function buildOriginalScopes(ranges) {
    validateStartBeforeEnd(ranges);
    // 1. Sort ranges by ascending start position.
    //    If two ranges have the same start position, we sort the one
    //    with the higher end position first, because it's the parent.
    ranges.sort((a, b) => comparePositions(a.start, b.start) || comparePositions(b.end, a.end));
    // 2. Build the trees from the ranges.
    const roots = [];
    const stack = [];
    for (const range of ranges) {
        // Pop all scopes that precede the current entry (to find the right parent).
        let stackTop = stack.at(-1);
        while (stackTop && comparePositions(stackTop.end, range.start) <= 0) {
            stack.pop();
            stackTop = stack.at(-1);
        }
        /*
         * Check for partially overlapping ranges:
         *
         * --- A
         *  |  --- B
         * ---  |
         *     ---
         *
         *i.e.: B.start < A.end < B.end
         */
        if (stackTop && comparePositions(range.start, stackTop.end) < 0 && comparePositions(stackTop.end, range.end) < 0) {
            throw new Error(`Range ${JSON.stringify(range)} and ${JSON.stringify(stackTop, (key, value) => key === 'parent' ? undefined : value)} partially overlap.`);
        }
        const scope = createScopeFrom(range, stackTop);
        if (stackTop) {
            stackTop.children.push(scope);
        }
        else {
            roots.push(scope);
        }
        stack.push(scope);
    }
    return roots;
}
function validateStartBeforeEnd(ranges) {
    for (const range of ranges) {
        if (comparePositions(range.start, range.end) >= 0) {
            throw new Error(`Invalid range. End before start: ${JSON.stringify(range)}`);
        }
    }
}
function createScopeFrom(range, parent) {
    // Copy only known fields: ranges can come from extensions and may carry extra properties.
    return {
        start: range.start,
        end: range.end,
        name: typeof range.name === 'string' ? range.name : String(range.name ?? ''),
        kind: 'Function',
        isStackFrame: true,
        parent,
        children: [],
        variables: [],
    };
}
/**
 * Implements decoding of the pasta source map specification.
 *
 * See https://github.com/bloomberg/pasta-sourcemaps/blob/main/spec.md
 */
export function decodePastaRanges(encodedRanges, names) {
    const result = [];
    let nameIndex = 0;
    let startLineNumber = 0;
    let startColumnNumber = 0;
    let endLineNumber = 0;
    let endColumnNumber = 0;
    const tokenIter = new TokenIterator(encodedRanges);
    let atStart = true;
    while (tokenIter.hasNext()) {
        if (atStart) {
            atStart = false;
        }
        else if (tokenIter.peek() === ',') {
            tokenIter.next();
        }
        else {
            // Unexpected character. Return what we have up until now.
            break;
        }
        nameIndex += tokenIter.nextVLQ();
        startLineNumber = endLineNumber + tokenIter.nextVLQ();
        startColumnNumber += tokenIter.nextVLQ();
        endLineNumber = startLineNumber + tokenIter.nextVLQ();
        endColumnNumber += tokenIter.nextVLQ();
        const name = names[nameIndex];
        if (name === undefined) {
            // If the range doesn't have a valid name, ignore it.
            continue;
        }
        result.push({
            start: { line: startLineNumber, column: startColumnNumber },
            end: { line: endLineNumber, column: endColumnNumber },
            name,
        });
    }
    return result;
}
/** @returns 0 if both positions are equal, a negative number if a < b and a positive number if a > b */
function comparePositions(a, b) {
    return a.line - b.line || a.column - b.column;
}
//# sourceMappingURL=SourceMapFunctionRanges.js.map