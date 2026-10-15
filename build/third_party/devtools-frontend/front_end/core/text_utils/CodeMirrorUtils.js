// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
export function createCssTokenizer() {
    async function tokenize(line, callback) {
        const streamParser = await CodeMirror.cssStreamParser();
        const stream = new CodeMirror.StringStream(line, 4, 2);
        const state = streamParser.startState(2);
        let lastPos = stream.pos;
        while (!stream.eol()) {
            stream.start = lastPos;
            let tokenType = streamParser.token(stream, state);
            /**
             * We expect unknown properties (like `unknownProp: unknownPropVal`) to still be
             * formatted correctly. However, `tokenType` for such properties are marked
             * as `error` from CodeMirror side and the internal state of the parser becomes `maybeprop`.
             *
             * So, we handle that specific keyword to be marked as `property` even though it is
             * not a known property. We do this because for our formatting purposes it doesn't matter
             * whether a property is a known CSS property or not.
             */
            if (tokenType === 'error' && state.state === 'maybeprop') {
                tokenType = 'property';
            }
            const segment = stream.current();
            callback(segment, tokenType);
            lastPos = stream.pos;
        }
    }
    return tokenize;
}
//# sourceMappingURL=CodeMirrorUtils.js.map