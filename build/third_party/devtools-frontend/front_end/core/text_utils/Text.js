// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import { TextCursor } from './TextCursor.js';
import { SourceRange, TextRange } from './TextRange.js';
export class Text {
    #value;
    #lineEndings;
    constructor(value) {
        this.#value = value;
    }
    lineEndings() {
        if (!this.#lineEndings) {
            this.#lineEndings = Platform.StringUtilities.findLineEndingIndexes(this.#value);
        }
        return this.#lineEndings;
    }
    value() {
        return this.#value;
    }
    lineCount() {
        const lineEndings = this.lineEndings();
        return lineEndings.length;
    }
    offsetFromPosition(lineNumber, columnNumber) {
        return (lineNumber ? this.lineEndings()[lineNumber - 1] + 1 : 0) + columnNumber;
    }
    positionFromOffset(offset) {
        const lineEndings = this.lineEndings();
        const lineNumber = Platform.ArrayUtilities.lowerBound(lineEndings, offset, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
        return { lineNumber, columnNumber: offset - (lineNumber && (lineEndings[lineNumber - 1] + 1)) };
    }
    lineAt(lineNumber) {
        const lineEndings = this.lineEndings();
        const lineStart = lineNumber > 0 ? lineEndings[lineNumber - 1] + 1 : 0;
        const lineEnd = lineEndings[lineNumber];
        let lineContent = this.#value.substring(lineStart, lineEnd);
        if (lineContent.length > 0 && lineContent.charAt(lineContent.length - 1) === '\r') {
            lineContent = lineContent.substring(0, lineContent.length - 1);
        }
        return lineContent;
    }
    toSourceRange(range) {
        const start = this.offsetFromPosition(range.startLine, range.startColumn);
        const end = this.offsetFromPosition(range.endLine, range.endColumn);
        return new SourceRange(start, end - start);
    }
    toTextRange(sourceRange) {
        const cursor = new TextCursor(this.lineEndings());
        const result = TextRange.createFromLocation(0, 0);
        cursor.resetTo(sourceRange.offset);
        result.startLine = cursor.lineNumber();
        result.startColumn = cursor.columnNumber();
        cursor.advance(sourceRange.offset + sourceRange.length);
        result.endLine = cursor.lineNumber();
        result.endColumn = cursor.columnNumber();
        return result;
    }
    replaceRange(range, replacement) {
        const sourceRange = this.toSourceRange(range);
        return this.#value.substring(0, sourceRange.offset) + replacement +
            this.#value.substring(sourceRange.offset + sourceRange.length);
    }
    extract(range) {
        const sourceRange = this.toSourceRange(range);
        return this.#value.substr(sourceRange.offset, sourceRange.length);
    }
}
//# sourceMappingURL=Text.js.map