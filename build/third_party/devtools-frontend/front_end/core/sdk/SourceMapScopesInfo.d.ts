import * as Formatter from '../../models/formatter/formatter.js';
import type * as ScopesCodec from '../../third_party/source-map-scopes-codec/source-map-scopes-codec.js';
import type * as Platform from '../platform/platform.js';
import type * as TextUtils from '../text_utils/text_utils.js';
import type { CallFrame, Location, ScopeChainEntry } from './DebuggerModel.js';
import type { SourceMap } from './SourceMap.js';
export declare class SourceMapScopesInfo {
    #private;
    constructor(sourceMap: SourceMap, scopeInfo: ScopesCodec.ScopeInfo, { isFromAst }?: {
        isFromAst?: boolean;
    });
    /**
     * If the source map does not contain any scopes information, this factory function attempts to create scope information
     * via the script's AST combined with the mappings.
     *
     * We create the generated ranges from the scope tree and for each range we create an original scope that matches the bounds 1:1.
     */
    static createFromAst(sourceMap: SourceMap, scopeTree: Formatter.FormatterWorkerPool.ScopeTreeNode, text: TextUtils.Text.Text): SourceMapScopesInfo;
    addOriginalScopes(scopes: Array<ScopesCodec.OriginalScope[] | null>): void;
    addGeneratedRanges(ranges: ScopesCodec.GeneratedRange[]): void;
    hasOriginalScopes(sourceIdx: number): boolean;
    isEmpty(): boolean;
    hasGeneratedRanges(): boolean;
    addOriginalScopesAtIndex(sourceIdx: number, scopes: ScopesCodec.OriginalScope[]): void;
    /**
     * @returns true if we have enough info (i.e. variable and binding expressions) to build
     * a scope view.
     */
    hasVariablesAndBindings(): boolean;
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
    resolveMappedScopeChain(callFrame: CallFrame): ScopeChainEntry[] | null;
    resolveMappedVariablesAtPosition(line: number, column: number, ignoreInnerBlockScopes?: boolean, inlineFrameIndex?: number): Array<Map<string, string | null>> | null;
    /**
     * Returns the authored function name of the function containing the provided generated position.
     */
    findOriginalFunctionName(position: ScopesCodec.Position): string | null;
    /**
     * Returns the authored function scope of the function containing the provided generated position.
     */
    findOriginalFunctionScope(position: ScopesCodec.Position): {
        scope: ScopesCodec.OriginalScope;
        url?: Platform.DevToolsPath.UrlString;
    } | null;
    /**
     * Translates a single "raw frame" or call-site, including outlined functions. It's the caller's responsibility to
     * merge outlined frames with their caller(s) (see {@link GeneratedFrameKind}).
     */
    translateRawFrame(generatedLine: number, generatedColumn: number): RawFrameTranslation;
    /**
     * @returns the body of the innermost inlined function at the position (the innermost range with a `callSite`
     *          within the generated function), or null if the position is not inside an inlined function.
     *
     * The innermost inlined function is the logical frame the position belongs to, i.e. the analogue of the top frame
     * of a real call stack. Stepping over its body therefore goes up exactly one logical frame: into the caller, which
     * may itself be inlined. An outer range would leave several logical frames at once.
     */
    inlinedFunctionRange(generatedLine: number, generatedColumn: number): PositionRange | null;
    /**
     * @returns the bodies of all functions that were inlined directly into the logical function at the position
     *          (the innermost inlined function, or else the generated function). Doesn't descend into inlined
     *          functions or nested generated functions.
     */
    inlinedCalleeRanges(generatedLine: number, generatedColumn: number): PositionRange[];
    /**
     * @returns the outlined parts of the authored function at the position: the hidden generated functions whose
     *          original scope lies within that function's original scope (see {@link GeneratedFrameKind.OUTLINED}),
     *          but not within a nested authored function. Includes the outlined part the position itself is in, if
     *          any. Sorted by start position.
     */
    outlinedFunctionRanges(generatedLine: number, generatedColumn: number): PositionRange[];
    /**
     * @returns the "artificial" generated functions (in the DWARF sense): functions that contain no authored code at all
     *          (no original scope anywhere in their subtree), e.g. compiler helpers. Sorted by start position,
     *          non-overlapping.
     */
    artificialFunctionRanges(): PositionRange[];
}
/** A range of generated positions, relative to the start of the script. `end` is exclusive. */
export interface PositionRange {
    readonly start: ScopesCodec.Position;
    readonly end: ScopesCodec.Position;
}
/**
 * Describes how the generated function surrounding a generated position shows up in stack traces.
 *
 * Compilers tend to introduce functions (and calls to them) that don't exist in the authored code. The scopes
 * proposal distinguishes two cases:
 *
 *   1) The generated function contains authored code, e.g. a block scope that was turned into a function. The
 *      generated range is marked "hidden", but links to the original scope via its definition. We can pause
 *      in such a function, but the frame is merged with its caller(s) in stack traces: The outlined code
 *      logically belongs to the (authored) function that transitively calls it.
 *
 *   2) The generated function doesn't represent any authored code, e.g. a compiler helper. The generated range
 *      has no definition. The scopes spec is being updated to say that such a range can be ignored in stack
 *      traces, so we drop these frames.
 */
export declare const enum GeneratedFrameKind {
    /** A regular (possibly with inlined functions) generated function, or top-level code. */
    VISIBLE = "VISIBLE",
    /** A generated function marked as "hidden" that has a definition (case 1). */
    OUTLINED = "OUTLINED",
    /** A generated function without a definition (case 2). */
    HIDDEN = "HIDDEN"
}
/** See {@link SourceMapScopesInfo.translateRawFrame}. */
export interface RawFrameTranslation {
    kind: GeneratedFrameKind;
    /**
     * [top, ...inlinedCallers] in top-to-bottom order. Empty for {@link GeneratedFrameKind.HIDDEN} frames, or if
     * neither the mappings nor the generated ranges know anything about the generated position.
     *
     * For {@link GeneratedFrameKind.OUTLINED} frames, the top frame is named after the authored function the outlined
     * code belongs to.
     */
    frames: TranslatedFrame[];
}
/**
 * Represents a stack frame in original terms. It closely aligns with StackTrace.StackTrace.Frame,
 * but since we can't import that type here we mirror it here somewhat.
 *
 * Equivalent to Pick<StackTrace.StackTrace.Frame, 'line'|'column'|'name'|'url'>, except that the position is
 * optional.
 */
export interface TranslatedFrame {
    /**
     * `line` and `column` are undefined iff the generated position has no mapping. The frame then only identifies
     * the authored function: `name`, `functionStart` and the `url` of the function's source.
     */
    line?: number;
    column?: number;
    name?: string;
    url?: Platform.DevToolsPath.UrlString;
    /** Start of the original function scope containing this frame's position. Undefined for top-level code. */
    functionStart?: ScopesCodec.Position;
}
export declare function findExpression(range: ScopesCodec.GeneratedRange | undefined, index: number, line?: number, column?: number): string | null;
export declare function contains(range: Pick<ScopesCodec.GeneratedRange, 'start' | 'end'>, line: number, column: number): boolean;
export declare function comparePositions(a: ScopesCodec.Position, b: ScopesCodec.Position): number;
/**
 * Converts a raw V8 {@link location} into a generated position relative to the start of its script.
 *
 * Positions in source maps (mappings and generated ranges) are relative to the start of the script,
 * while V8 reports locations in inline `<script>`s (without `//# sourceURL`) relative to the start of
 * the surrounding document.
 */
export declare function scriptRelativePosition(location: Location): ScopesCodec.Position;
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
export declare function findMatchingScopeNumber(callFrame: CallFrame, range: ScopesCodec.GeneratedRange): number | undefined;
