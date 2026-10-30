// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class IdentityFormatter {
    builder;
    constructor(builder) {
        this.builder = builder;
    }
    format(text, _lineEndings, fromOffset, toOffset) {
        const content = text.substring(fromOffset, toOffset);
        this.builder.addToken(content, fromOffset);
    }
}
//# sourceMappingURL=IdentityFormatter.js.map