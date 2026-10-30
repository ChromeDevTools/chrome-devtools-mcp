import type { DecodedScopeInfo, Position, SourceMap } from "../scopes.ts";
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
export declare const enum DecodeMode {
    STRICT = 1,
    LAX = 2
}
export interface DecodeOptions {
    mode: DecodeMode;
    /**
     * Offsets `start` and `end` of all generated ranges by the specified amount.
     * Intended to be used when decoding sections of index source maps one-by-one.
     *
     * Has no effect when passing a {@link IndexSourceMapJson} directly to {@link decode}.
     */
    generatedOffset: Position;
}
export declare const DEFAULT_DECODE_OPTIONS: DecodeOptions;
export declare function decode(sourceMap: SourceMap, options?: Partial<DecodeOptions>): DecodedScopeInfo;
