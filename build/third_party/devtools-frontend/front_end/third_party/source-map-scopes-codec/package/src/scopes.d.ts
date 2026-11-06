/**
 * The scopes information found in a source map.
 */
export interface ScopeInfo {
    /**
     * The length of {@linkcode scopes} must match the length of "sources" in the source map JSON. Each entry describes the scope trees of the corresponding source file.
     */
    scopes: (OriginalScope[] | null)[];
    /**
     * The range tree of the generated bundle. Multiple top-level ranges are allowed but must not overlap source position wise.
     */
    ranges: GeneratedRange[];
}
/**
 * The scopes information produced by the decoder.
 */
export interface DecodedScopeInfo extends ScopeInfo {
    /**
     * When the encoded scopes contained variable and binding expression items.
     * Note that a value of `true` also indicates "partial" info and does not guarantee comprehensiveness.
     */
    hasVariableAndBindingInfo: boolean;
}
/**
 * A scope in the authored source.
 */
export interface OriginalScope {
    /** The beginning of this scope (inclusive). */
    start: Position;
    /** The end of this scope (exclusive) */
    end: Position;
    /**
     * The name of this scope. For function scopes this is the function name.
     *
     * Constructors may put the class name here.
     */
    name?: string;
    /**
     * JavaScript-like languages are encouraged to use 'Global', 'Class', 'Function' and 'Block'.
     *
     * The "kind" is only used in debuggers as a label for scope UI views, but does not have any
     * semantic significance.
     */
    kind?: string;
    /**
     * Whether this scope is something that can be called and results in stack frame (e.g. functions, methods, etc.).
     */
    isStackFrame: boolean;
    /**
     * All variable names that this scope declares.
     */
    variables: string[];
    /**
     * The child scopes. When manually building scopes, {@linkcode children} must be sorted, not
     * overlap each other and be contained within [start, end).
     */
    children: OriginalScope[];
    /** The parent scope or `undefined` for top-level scopes. */
    parent?: OriginalScope;
}
/**
 * A range (can be a scope) in the generated JavaScript/WASM.
 *
 * The name "range" was chosen deliberately as a GeneratedRange does not necessarily
 * correspond to a lexical JavaScript scope. E.g. inlining, or concatenating multiple
 * bundles can result in generated ranges that are not lexical scopes.
 */
export interface GeneratedRange {
    /** The beginning of this range (inclusive) */
    start: Position;
    /** The end of this range (exclusive) */
    end: Position;
    /**
     * The corresponding scope in the authored source.
     */
    originalScope?: OriginalScope;
    /**
     * Whether this generated range is an actual JavaScript/WASM function in the generated code.
     */
    isStackFrame: boolean;
    /**
     * Whether calls to this generated range should be hidden from stack traces even if
     * this range has an `originalScope`.
     */
    isHidden: boolean;
    /**
     * If this `GeneratedRange` is the result of inlining `originalScope`, then `callSite`
     * refers to where `originalScope` was called in the original ("authored") code.
     *
     * If this field is present than `originalScope` is present as well and `isStackFrame` is `false`.
     */
    callSite?: OriginalPosition;
    /**
     * Expressions that compute the values of the variables of this OriginalScope. The length
     * of `values` matches the length of `originalScope.variables`.
     */
    values: Binding[];
    /**
     * The child ranges. When manually building ranges, {@linkcode children} must be sorted,
     * not overlap each other and be contained within [start, end).
     */
    children: GeneratedRange[];
    /** The parent range or `undefined` for top-level ranges. */
    parent?: GeneratedRange;
}
/**
 * For each variable, this can either be:
 *
 *   1) A single expression (valid for a full `GeneratedRange`).
 *
 *   2) `null` if this variable is unavailable in the whole range. This can
 *      happen e.g. when the variable was optimized out and can't be recomputed.
 *
 *   3) A list of `SubRangeBinding`s. Used when computing the value requires different
 *      expressions throughout the `GeneratedRange` or if the variable is unavailable in
 *      parts of the `GeneratedRange`.
 *
 *      Note: The decoder produces `SubRangeBindings` where the "from" of the first `SubRangeBinding`
 *      and the "to" of the last `SubRangeBinding` are equal to the `GeneratedRange`s "start" and "end"
 *      position respectively.
 */
export type Binding = string | null | SubRangeBinding[];
export interface SubRangeBinding {
    value?: string;
    from: Position;
    to: Position;
}
/**
 * A position with 0-based line and column numbers.
 *
 * A {@linkcode Position} object by itself does not imply a position in original source
 * or generated code. It is used in both and normally it is clear from context.
 */
export interface Position {
    line: number;
    column: number;
}
/**
 * A position with 0-based line and column numbers in a specific original source file.
 */
export interface OriginalPosition extends Position {
    /** The 0-based index into "sources" in the source map. Or into {@linkcode ScopeInfo.scopes}. */
    sourceIndex: number;
}
/**
 * A standard source map, or index source map as per https://tc39.es/ecma426.
 */
export type SourceMap = SourceMapJson | IndexSourceMapJson;
/**
 * A standard index source map json object as per https://tc39.es/ecma426.
 */
export interface IndexSourceMapJson {
    version: 3;
    sections: Array<{
        offset: Position;
        map: SourceMapJson;
    }>;
}
/**
 * A standard source map json object as per https://tc39.es/ecma426.
 */
export interface SourceMapJson {
    version: 3;
    sources: (string | null)[];
    mappings: string;
    names?: string[];
    scopes?: (string | null)[];
    ranges?: string[];
}
