// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
const MAX_SAFE_INT32 = 2 ** 31 - 1;
export class TextRange {
    startLine;
    startColumn;
    endLine;
    endColumn;
    constructor(startLine, startColumn, endLine, endColumn) {
        this.startLine = startLine;
        this.startColumn = startColumn;
        this.endLine = endLine;
        this.endColumn = endColumn;
    }
    static createFromLocation(line, column) {
        return new TextRange(line, column, line, column);
    }
    static createUnboundedFromLocation(line, column) {
        return new TextRange(line, column, MAX_SAFE_INT32, MAX_SAFE_INT32);
    }
    static fromObject(serializedTextRange) {
        return new TextRange(serializedTextRange.startLine, serializedTextRange.startColumn, serializedTextRange.endLine, serializedTextRange.endColumn);
    }
    static comparator(range1, range2) {
        return range1.compareTo(range2);
    }
    static fromEdit(oldRange, newText) {
        let endLine = oldRange.startLine;
        let endColumn = oldRange.startColumn + newText.length;
        const lineEndings = Platform.StringUtilities.findLineEndingIndexes(newText);
        if (lineEndings.length > 1) {
            endLine = oldRange.startLine + lineEndings.length - 1;
            const len = lineEndings.length;
            endColumn = lineEndings[len - 1] - lineEndings[len - 2] - 1;
        }
        return new TextRange(oldRange.startLine, oldRange.startColumn, endLine, endColumn);
    }
    isEmpty() {
        return this.startLine === this.endLine && this.startColumn === this.endColumn;
    }
    immediatelyPrecedes(range) {
        if (!range) {
            return false;
        }
        return this.endLine === range.startLine && this.endColumn === range.startColumn;
    }
    immediatelyFollows(range) {
        if (!range) {
            return false;
        }
        return range.immediatelyPrecedes(this);
    }
    follows(range) {
        return (range.endLine === this.startLine && range.endColumn <= this.startColumn) || range.endLine < this.startLine;
    }
    get linesCount() {
        return this.endLine - this.startLine;
    }
    collapseToEnd() {
        return new TextRange(this.endLine, this.endColumn, this.endLine, this.endColumn);
    }
    collapseToStart() {
        return new TextRange(this.startLine, this.startColumn, this.startLine, this.startColumn);
    }
    normalize() {
        if (this.startLine > this.endLine || (this.startLine === this.endLine && this.startColumn > this.endColumn)) {
            return new TextRange(this.endLine, this.endColumn, this.startLine, this.startColumn);
        }
        return this.clone();
    }
    clone() {
        return new TextRange(this.startLine, this.startColumn, this.endLine, this.endColumn);
    }
    serializeToObject() {
        return {
            startLine: this.startLine,
            startColumn: this.startColumn,
            endLine: this.endLine,
            endColumn: this.endColumn,
        };
    }
    compareTo(other) {
        if (this.startLine > other.startLine) {
            return 1;
        }
        if (this.startLine < other.startLine) {
            return -1;
        }
        if (this.startColumn > other.startColumn) {
            return 1;
        }
        if (this.startColumn < other.startColumn) {
            return -1;
        }
        return 0;
    }
    compareToPosition(lineNumber, columnNumber) {
        if (lineNumber < this.startLine || (lineNumber === this.startLine && columnNumber < this.startColumn)) {
            return -1;
        }
        if (lineNumber > this.endLine || (lineNumber === this.endLine && columnNumber > this.endColumn)) {
            return 1;
        }
        return 0;
    }
    equal(other) {
        return this.startLine === other.startLine && this.endLine === other.endLine &&
            this.startColumn === other.startColumn && this.endColumn === other.endColumn;
    }
    relativeTo(line, column) {
        const relative = this.clone();
        if (this.startLine === line) {
            relative.startColumn -= column;
        }
        if (this.endLine === line) {
            relative.endColumn -= column;
        }
        relative.startLine -= line;
        relative.endLine -= line;
        return relative;
    }
    relativeFrom(line, column) {
        const relative = this.clone();
        if (this.startLine === 0) {
            relative.startColumn += column;
        }
        if (this.endLine === 0) {
            relative.endColumn += column;
        }
        relative.startLine += line;
        relative.endLine += line;
        return relative;
    }
    rebaseAfterTextEdit(originalRange, editedRange) {
        console.assert(originalRange.startLine === editedRange.startLine);
        console.assert(originalRange.startColumn === editedRange.startColumn);
        const rebase = this.clone();
        if (!this.follows(originalRange)) {
            return rebase;
        }
        const lineDelta = editedRange.endLine - originalRange.endLine;
        const columnDelta = editedRange.endColumn - originalRange.endColumn;
        rebase.startLine += lineDelta;
        rebase.endLine += lineDelta;
        if (rebase.startLine === editedRange.endLine) {
            rebase.startColumn += columnDelta;
        }
        if (rebase.endLine === editedRange.endLine) {
            rebase.endColumn += columnDelta;
        }
        return rebase;
    }
    toString() {
        return JSON.stringify(this);
    }
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
    containsLocation(lineNumber, columnNumber) {
        if (this.startLine === this.endLine) {
            return this.startLine === lineNumber && this.startColumn <= columnNumber && columnNumber < this.endColumn;
        }
        if (this.startLine === lineNumber) {
            return this.startColumn <= columnNumber;
        }
        if (this.endLine === lineNumber) {
            return columnNumber < this.endColumn;
        }
        return this.startLine < lineNumber && lineNumber < this.endLine;
    }
    get start() {
        return { lineNumber: this.startLine, columnNumber: this.startColumn };
    }
    get end() {
        return { lineNumber: this.endLine, columnNumber: this.endColumn };
    }
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
    intersection(that) {
        let { startLine, startColumn } = this;
        if (startLine < that.startLine) {
            startLine = that.startLine;
            startColumn = that.startColumn;
        }
        else if (startLine === that.startLine) {
            startColumn = Math.max(startColumn, that.startColumn);
        }
        let { endLine, endColumn } = this;
        if (endLine > that.endLine) {
            endLine = that.endLine;
            endColumn = that.endColumn;
        }
        else if (endLine === that.endLine) {
            endColumn = Math.min(endColumn, that.endColumn);
        }
        if (startLine > endLine || (startLine === endLine && startColumn >= endColumn)) {
            return new TextRange(0, 0, 0, 0);
        }
        return new TextRange(startLine, startColumn, endLine, endColumn);
    }
}
export class SourceRange {
    offset;
    length;
    constructor(offset, length) {
        this.offset = offset;
        this.length = length;
    }
    cssValue() {
        return `${this.offset},${this.length}`;
    }
}
//# sourceMappingURL=TextRange.js.map