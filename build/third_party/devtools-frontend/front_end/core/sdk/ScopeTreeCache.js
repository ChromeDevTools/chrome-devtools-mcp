// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Formatter from '../../models/formatter/formatter.js';
import * as TextUtils from '../text_utils/text_utils.js';
/** If a script failed to parse, we stash null in order to prevent unnecessary re-parsing */
const scopeTrees = new WeakMap();
/**
 * Computes and caches the scope tree for `script`.
 *
 * We use {@link Script} as a key to uniquely identify scripts.
 * {@link Script} boils down to "target" + "script ID". This
 * duplicates work in case of identical script running on multiple targets
 * (e.g. workers).
 *
 * We also return a {@link TextUtils.Text.Text} instance. The scope tree uses offsets
 * and the text allows conversion from/to line/column numbers.
 */
export function scopeTreeForScript(script) {
    if (script.isWasm()) {
        return Promise.resolve(null);
    }
    let promise = scopeTrees.get(script);
    if (promise === undefined) {
        promise = script.requestContentData().then(content => {
            if (TextUtils.ContentData.ContentData.isError(content)) {
                return null;
            }
            const sourceType = script.isModule ? 'module' : 'script';
            return Formatter.FormatterWorkerPool.formatterWorkerPool()
                .javaScriptScopeTree(content.text, sourceType)
                .then(scopeTree => scopeTree ? ({ scopeTree, text: content.textObj }) : null)
                .catch(() => null);
        });
        scopeTrees.set(script, promise);
    }
    // We intentionally return `null` here if the script already failed to parse once.
    return promise;
}
//# sourceMappingURL=ScopeTreeCache.js.map