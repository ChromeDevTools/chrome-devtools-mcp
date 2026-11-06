// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @file Stepping through code with encoded source map scopes: inlined functions, outlined functions and unmapped code.
 *
 * Mirrors the Wasm auto-stepping: user steps get a skip list (see `DebuggerWorkspaceBinding.computeAutoStep`), and
 * pauses that don't correspond to a "logical" step are continued automatically ({@link nextAutoStep}).
 *
 * Outlined code is code of an authored function that the compiler moved into a separate generated function marked as
 * "hidden". A run of outlined frames on top of the stack is one logical frame together with the frame below them (the
 * "owner"), see {@link logicalDepth}. Step overs enter the outlined parts of the current function, see
 * {@link outlinedFunctionRanges}.
 */
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
/**
 * @returns the script-relative position of {@link frame}, if it's in a script with encoded source map scopes.
 *          Scopes without any mappings are ignored: every position would count as unmapped (see {@link isUnmapped}).
 */
function scopedPosition(frame) {
    if (!Root.Runtime.hostConfig.devToolsSourceMapScopesInSourcesPanel?.enabled) {
        return null;
    }
    const script = frame.script;
    const sourceMap = script.sourceMap();
    if (!sourceMap?.hasEncodedScopeInfo() || sourceMap.mappings().length === 0) {
        return null;
    }
    const { lineNumber, columnNumber } = script.rawLocationToRelativeLocation(frame.location());
    return { sourceMap, script, line: lineNumber, column: columnNumber };
}
function toLocationRanges({ script }, ranges) {
    const toLocation = ({ line, column }) => {
        const { lineNumber, columnNumber } = script.relativeLocationToRawLocation({ lineNumber: line, columnNumber: column });
        return script.debuggerModel.createRawLocation(script, lineNumber, columnNumber);
    };
    return ranges.map(({ start, end }) => ({ start: toLocation(start), end: toLocation(end) }));
}
export function isScopedFrame(frame) {
    return scopedPosition(frame) !== null;
}
/** @returns the number of leading frames that are outlined parts of the (logical) frame below them. */
function outlinedPrefixLength(callFrames) {
    let length = 0;
    for (const frame of callFrames) {
        const position = scopedPosition(frame);
        if (!position ||
            position.sourceMap.translateRawFrame(position.line, position.column)?.kind !== "OUTLINED" /* SDK.SourceMapScopesInfo.GeneratedFrameKind.OUTLINED */) {
            break;
        }
        ++length;
    }
    return length;
}
/**
 * @returns the stack depth that doesn't count outlined frames on top of the stack. Entering or leaving an outlined
 *          part of a function doesn't change it, while calling a function increases it.
 */
export function logicalDepth(callFrames) {
    return callFrames.length - outlinedPrefixLength(callFrames);
}
/** @returns true iff {@link frame} has encoded scopes, and its position is not mapped to any source. */
export function isUnmapped(frame) {
    const position = scopedPosition(frame);
    return position !== null && position.sourceMap.findEntry(position.line, position.column)?.sourceURL === undefined;
}
/** @returns true iff both frames have encoded scopes and are mapped to the same original location. */
export function isSameOriginalLocation(a, b) {
    const entry = (frame) => {
        const position = scopedPosition(frame);
        return position?.sourceMap.findEntry(position.line, position.column) ?? null;
    };
    const entryA = entry(a);
    const entryB = entry(b);
    return entryA?.sourceURL !== undefined && entryA.sourceURL === entryB?.sourceURL &&
        entryA.sourceLineNumber === entryB.sourceLineNumber && entryA.sourceColumnNumber === entryB.sourceColumnNumber;
}
/** @returns the body of the innermost inlined function that {@link frame} is paused in (empty if none). */
export function inlinedFunctionRanges(frame) {
    const position = scopedPosition(frame);
    const range = position?.sourceMap.inlinedFunctionRange(position.line, position.column);
    return position && range ? toLocationRanges(position, [range]) : [];
}
/**
 * @returns true iff both frames are paused in the same call of an inlined function (or both aren't in any). Separate
 *          calls of the same function are inlined into separate generated ranges.
 */
function isSameInlinedCall(a, b) {
    const range = (frame) => {
        const position = scopedPosition(frame);
        return position?.sourceMap.inlinedFunctionRange(position.line, position.column) ?? null;
    };
    const rangeA = range(a);
    const rangeB = range(b);
    if (!rangeA || !rangeB) {
        return rangeA === rangeB;
    }
    return a.script === b.script && SDK.SourceMapScopesInfo.comparePositions(rangeA.start, rangeB.start) === 0 &&
        SDK.SourceMapScopesInfo.comparePositions(rangeA.end, rangeB.end) === 0;
}
/** @returns the bodies of the functions inlined into the logical function that {@link frame} is paused in. */
export function inlinedCalleeRanges(frame) {
    const position = scopedPosition(frame);
    return position ? toLocationRanges(position, position.sourceMap.inlinedCalleeRanges(position.line, position.column)) :
        [];
}
/**
 * @returns the bodies of the outlined parts of the logical function that {@link frame} is paused in. A step over
 *          enters them (`enterRanges`), as stepping over a call into them would skip authored code of that function.
 */
export function outlinedFunctionRanges(frame) {
    const position = scopedPosition(frame);
    return position ?
        toLocationRanges(position, position.sourceMap.outlinedFunctionRanges(position.line, position.column)) :
        [];
}
function compareLocations(a, b) {
    return a.lineNumber - b.lineNumber || (a.columnNumber ?? 0) - (b.columnNumber ?? 0);
}
/** @returns true iff {@link frame} is paused inside one of {@link ranges} (start inclusive, end exclusive). */
function isInRanges(frame, ranges) {
    const location = frame.location();
    return ranges.some(({ start, end }) => start.scriptId === location.scriptId && compareLocations(start, location) <= 0 &&
        compareLocations(location, end) < 0);
}
/**
 * Decides whether the pause {@link details} completes the user's step {@link context}.
 *
 * @returns null to present the pause, or the step to issue instead.
 */
export async function nextAutoStep(details, context, computeAutoStep) {
    if (!context || details.reason !== "step" /* Protocol.Debugger.PausedEventReason.Step */) {
        return null;
    }
    const frames = details.callFrames;
    const start = context.callFrames;
    if (frames.length === 0 || start.length === 0 || (!isScopedFrame(frames[0]) && !isScopedFrame(start[0]))) {
        return null;
    }
    switch (context.mode) {
        case "StepInto" /* SDK.DebuggerModel.StepMode.STEP_INTO */:
            return isUnmapped(frames[0]) ? await computeAutoStep("StepInto" /* SDK.DebuggerModel.StepMode.STEP_INTO */, frames) : null;
        case "StepOver" /* SDK.DebuggerModel.StepMode.STEP_OVER */: {
            const startDepth = logicalDepth(start);
            const depth = logicalDepth(frames);
            if (isUnmapped(frames[0]) ||
                (depth === startDepth && isSameOriginalLocation(frames[0], start[0]) &&
                    isSameInlinedCall(frames[0], start[0]))) {
                // Unmapped code, or still on the same original location in the same (inlined) call (the skip list only covers
                // the generated ranges that contain the start position): keep stepping over.
                return await computeAutoStep("StepOver" /* SDK.DebuggerModel.StepMode.STEP_OVER */, frames);
            }
            return null;
        }
        case "StepOut" /* SDK.DebuggerModel.StepMode.STEP_OUT */: {
            const outlinedPrefix = outlinedPrefixLength(start);
            // Without an owner (an outlined part invoked from a task), or when the step out started in a function inlined
            // into the outlined part (which is issued as a step over its body), a plain step out is right.
            if (outlinedPrefix > 0 && outlinedPrefix < start.length && inlinedFunctionRanges(start[0]).length === 0) {
                // The owner is paused at the call into its outlined parts. If that call is inside an inlined function, the
                // logical frame to step out of is that inlined function, otherwise it's the owner itself.
                const ownerInlined = inlinedFunctionRanges(start[outlinedPrefix]);
                const targetLength = start.length - outlinedPrefix - (ownerInlined.length > 0 ? 0 : 1);
                if (frames.length > targetLength) {
                    // We are still in the outlined parts or in their owner: keep stepping out.
                    return { command: "StepOut" /* SDK.DebuggerModel.StepMode.STEP_OUT */, ranges: [] };
                }
                if (frames.length === targetLength && isInRanges(frames[0], ownerInlined)) {
                    // We are back in the owner, but still in the inlined function: step over the rest of it.
                    return { command: "StepOver" /* SDK.DebuggerModel.StepMode.STEP_OVER */, ranges: ownerInlined };
                }
            }
            // Stepping into calls of the unmapped code would present a pause inside the callee, so continue as step over.
            return isUnmapped(frames[0]) ? await computeAutoStep("StepOver" /* SDK.DebuggerModel.StepMode.STEP_OVER */, frames) : null;
        }
    }
}
//# sourceMappingURL=SourceMapStepping.js.map