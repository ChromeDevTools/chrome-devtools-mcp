// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
export class TextCursor {
    #lineEndings;
    #offset = 0;
    #lineNumber = 0;
    #columnNumber = 0;
    constructor(lineEndings) {
        this.#lineEndings = lineEndings;
    }
    advance(offset) {
        this.#offset = offset;
        while (this.#lineNumber < this.#lineEndings.length && this.#lineEndings[this.#lineNumber] < this.#offset) {
            ++this.#lineNumber;
        }
        this.#columnNumber = this.#lineNumber ? this.#offset - this.#lineEndings[this.#lineNumber - 1] - 1 : this.#offset;
    }
    offset() {
        return this.#offset;
    }
    resetTo(offset) {
        this.#offset = offset;
        this.#lineNumber =
            Platform.ArrayUtilities.lowerBound(this.#lineEndings, offset, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
        this.#columnNumber = this.#lineNumber ? this.#offset - this.#lineEndings[this.#lineNumber - 1] - 1 : this.#offset;
    }
    lineNumber() {
        return this.#lineNumber;
    }
    columnNumber() {
        return this.#columnNumber;
    }
}
//# sourceMappingURL=TextCursor.js.map