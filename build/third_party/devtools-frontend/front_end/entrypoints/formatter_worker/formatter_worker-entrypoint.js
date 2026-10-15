// Copyright 2019 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import * as FormatterWorker from './formatter_worker.js';
Platform.HostRuntime.HOST_RUNTIME.workerScope.onmessage = function (event) {
    const method = event.data.method;
    const params = event.data.params;
    if (!method) {
        return;
    }
    switch (method) {
        case "format" /* FormatterActions.FORMAT */:
            Platform.HostRuntime.HOST_RUNTIME.workerScope.postMessage(FormatterWorker.FormatterWorker.format(params.mimeType, params.content, params.indentString));
            break;
        case "parseCSS" /* FormatterActions.PARSE_CSS */:
            FormatterWorker.CSSRuleParser.parseCSS(params.content, self.postMessage);
            break;
        case "javaScriptSubstitute" /* FormatterActions.JAVASCRIPT_SUBSTITUTE */: {
            let result;
            try {
                result = FormatterWorker.Substitute.substituteExpression(params.content, params.mapping);
            }
            catch (error) {
                result = { error: error instanceof Error ? error.message : String(error) };
            }
            Platform.HostRuntime.HOST_RUNTIME.workerScope.postMessage(result);
            break;
        }
        case "javaScriptScopeTree" /* FormatterActions.JAVASCRIPT_SCOPE_TREE */: {
            Platform.HostRuntime.HOST_RUNTIME.workerScope.postMessage(FormatterWorker.ScopeParser.parseScopes(params.content, params.sourceType)?.export());
            break;
        }
        default:
            Platform.assertNever(method, `Unsupport method name: ${method}`);
    }
};
Platform.HostRuntime.HOST_RUNTIME.workerScope.postMessage('workerReady');
//# sourceMappingURL=formatter_worker-entrypoint.js.map