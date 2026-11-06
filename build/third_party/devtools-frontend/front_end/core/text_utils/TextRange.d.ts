export interface SerializedTextRange {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}
export declare class TextRange {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    constructor(startLine: number, startColumn: number, endLine: number, endColumn: number);
    static createFromLocation(line: number, column: number): TextRange;
    static createUnboundedFromLocation(line: number, column: number): TextRange;
    static fromObject(serializedTextRange: SerializedTextRange): TextRange;
    static comparator(range1: TextRange, range2: TextRange): number;
    static fromEdit(oldRange: TextRange, newText: string): TextRange;
    isEmpty(): boolean;
    immediatelyPrecedes(range?: TextRange): boolean;
    immediatelyFollows(range?: TextRange): boolean;
    follows(range: TextRange): boolean;
    get linesCount(): number;
    collapseToEnd(): TextRange;
    collapseToStart(): TextRange;
    normalize(): TextRange;
    clone(): TextRange;
    serializeToObject(): {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
    };
    compareTo(other: TextRange): number;
    compareToPosition(lineNumber: number, columnNumber: number): number;
    equal(other: TextRange): boolean;
    relativeTo(line: number, column: number): TextRange;
    relativeFrom(line: number, column: number): TextRange;
    rebaseAfterTextEdit(originalRange: TextRange, editedRange: TextRange): TextRange;
    toString(): string;
    /**
     * Checks whether this {@link TextRange} contains the location identified by the
     * {@link lineNumber} and {@link columnNumber}. The beginning of the text range is
     * considered inclusive while the end of the text range is considered exclusive
     * for this comparison, meaning that for example a range `(0,1)-(1,4)` contains the
     * location `(0,1)` but does not contain the location `(1,4)`.
     *
     * @param lineNumber the location's line offset.
     * @param columnNumber the location's column offset.
     * @returns `true` if the location identified by {@link lineNumber} and {@link columnNumber}
     *          is contained within this text range.
     */
    containsLocation(lineNumber: number, columnNumber: number): boolean;
    get start(): {
        lineNumber: number;
        columnNumber: number;
    };
    get end(): {
        lineNumber: number;
        columnNumber: number;
    };
    /**
     * Checks whether this and `that` {@link TextRange} overlap and if they do, computes the
     * intersection range. If they don't overlap an empty text range is returned instead (for
     * which {@link #isEmpty()} yields `true`).
     *
     * The beginning of text ranges is considered to be includes while the end of the text
     * ranges is considered exclusive for the intersection, meaning that for example intersecting
     * `(0,1)-(1,4)` and `(1,4)-(1,6)` yields an empty range.
     *
     * @param that the other text range.
     * @returns the intersection of this and `that` text range, which might be empty if their don't
     *          overlap.
     */
    intersection(that: TextRange): TextRange;
}
export declare class SourceRange {
    offset: number;
    length: number;
    constructor(offset: number, length: number);
    cssValue(): string;
}
