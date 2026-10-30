/**
 * Implements decoding of the `rangeMappings` field of the "range mappings" proposal.
 *
 * The field holds one entry per line of the generated code, separated by `;`. Each line is
 * a bare sequence of unsigned Base64 VLQs (no separators in between) denoting which of the
 * mappings on that line are range mappings: the first VLQ is an absolute index into the
 * line's mappings, every subsequent one an offset from the previous index. An offset of zero
 * repeats the previous index, which is tolerated rather than treated as an error.
 *
 * @returns for every line of the generated code, the sorted indices of the mappings on
 *          that line which are range mappings.
 * @throws if the field is not a well-formed sequence of unsigned VLQs and `;` separators.
 * @see https://github.com/tc39/source-map/blob/main/proposals/range-mappings.md
 */
export declare function decodeRangeMappings(encodedRangeMappings: string): number[][];
