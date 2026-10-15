// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { CSSLocation } from './CSSLocation.js';
export class CSSQuery {
    text = '';
    range;
    styleSheetId;
    cssModel;
    constructor(cssModel) {
        this.cssModel = cssModel;
    }
    rebase(edit) {
        if (this.styleSheetId !== edit.styleSheetId || !this.range) {
            return;
        }
        if (edit.oldRange.equal(this.range)) {
            this.reinitialize(edit.payload);
        }
        else {
            this.range = this.range.rebaseAfterTextEdit(edit.oldRange, edit.newRange);
        }
    }
    equal(other) {
        if (!this.styleSheetId || !this.range || !other.range) {
            return false;
        }
        return this.styleSheetId === other.styleSheetId && this.range.equal(other.range);
    }
    lineNumberInSource() {
        if (!this.range) {
            return undefined;
        }
        return this.header()?.lineNumberInSource(this.range.startLine);
    }
    columnNumberInSource() {
        if (!this.range) {
            return undefined;
        }
        return this.header()?.columnNumberInSource(this.range.startLine, this.range.startColumn);
    }
    header() {
        return this.styleSheetId ? this.cssModel.styleSheetHeaderForId(this.styleSheetId) : null;
    }
    rawLocation() {
        const header = this.header();
        if (!header || this.lineNumberInSource() === undefined) {
            return null;
        }
        const lineNumber = Number(this.lineNumberInSource());
        return new CSSLocation(header, lineNumber, this.columnNumberInSource());
    }
}
//# sourceMappingURL=CSSQuery.js.map