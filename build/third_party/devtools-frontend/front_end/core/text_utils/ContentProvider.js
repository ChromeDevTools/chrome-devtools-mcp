// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class SearchMatch {
    lineNumber;
    lineContent;
    columnNumber;
    matchLength;
    constructor(lineNumber, lineContent, columnNumber, matchLength) {
        this.lineNumber = lineNumber;
        this.lineContent = lineContent;
        this.columnNumber = columnNumber;
        this.matchLength = matchLength;
    }
    static comparator(a, b) {
        return a.lineNumber - b.lineNumber || a.columnNumber - b.columnNumber;
    }
}
export const contentAsDataURL = function (content, mimeType, contentEncoded, charset, limitSize = true) {
    const maxDataUrlSize = 1024 * 1024;
    if (content === undefined || content === null || (limitSize && content.length > maxDataUrlSize)) {
        return null;
    }
    content = contentEncoded ? content : encodeURIComponent(content);
    return 'data:' + mimeType + (charset ? ';charset=' + charset : '') + (contentEncoded ? ';base64' : '') + ',' +
        content;
};
export const isStreamingContentProvider = function (provider) {
    return 'requestStreamingContent' in provider;
};
//# sourceMappingURL=ContentProvider.js.map