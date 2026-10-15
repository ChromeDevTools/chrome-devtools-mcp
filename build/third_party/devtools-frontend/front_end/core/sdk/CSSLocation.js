// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class CSSLocation {
    #cssModel;
    styleSheetId;
    url;
    lineNumber;
    columnNumber;
    constructor(header, lineNumber, columnNumber) {
        this.#cssModel = header.cssModel();
        this.styleSheetId = header.id;
        this.url = header.resourceURL();
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber || 0;
    }
    cssModel() {
        return this.#cssModel;
    }
    header() {
        return this.#cssModel.styleSheetHeaderForId(this.styleSheetId);
    }
}
//# sourceMappingURL=CSSLocation.js.map