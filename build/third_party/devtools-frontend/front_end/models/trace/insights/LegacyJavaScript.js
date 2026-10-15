// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as LegacyJavaScriptLib from '../../../third_party/legacy-javascript/legacy-javascript.js';
import * as Helpers from '../helpers/helpers.js';
import { estimateCompressionRatioForScript, metricSavingsForWastedBytes } from './Common.js';
import { InsightCategory, InsightKeys, } from './types.js';
const { detectLegacyJavaScript } = LegacyJavaScriptLib.LegacyJavaScript;
export const UIStrings = {
    /**
     * @description Title of an insight that identifies polyfills for modern JavaScript features, and recommends their removal.
     */
    title: 'Legacy JavaScript',
    /**
     * @description Description of an insight that identifies polyfills for modern JavaScript features, and recommends their removal.
     */
    description: 'Polyfills and transforms enable older browsers to use new JavaScript features. However, many aren’t necessary for modern browsers. Consider modifying your JavaScript build process to not transpile [Baseline](https://web.dev/articles/baseline-and-polyfills) features, unless you know you must support older browsers. [Learn why most sites can deploy ES6+ code without transpiling](https://developer.chrome.com/docs/performance/insights/legacy-javascript).',
    /**
     * @description Label for a column in a data table; entries will be the individual JavaScript scripts.
     */
    columnScript: 'Script',
    /**
     * @description Label for a column in a data table; entries will be the number of wasted bytes (aka the estimated savings in terms of bytes).
     */
    columnWastedBytes: 'Wasted bytes',
    /**
     * @description Message shown when no legacy JavaScript is found.
     */
    noLegacyJavaScript: 'No legacy JavaScript found',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/LegacyJavaScript.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const BYTE_THRESHOLD = 5000;
function finalize(partialModel) {
    const requests = [...partialModel.legacyJavaScriptResults.keys()].map(script => script.request).filter(e => !!e);
    return {
        insightKey: InsightKeys.LEGACY_JAVASCRIPT,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/legacy-javascript',
        category: InsightCategory.ALL,
        state: requests.length ? 'fail' : 'pass',
        relatedEvents: [...new Set(requests)],
        ...partialModel,
    };
}
export function isLegacyJavaScript(model) {
    return model.insightKey === InsightKeys.LEGACY_JAVASCRIPT;
}
export function generateInsight(data, context) {
    const scripts = data.Scripts.scripts.filter(script => {
        if (script.frame !== context.frameId) {
            return false;
        }
        if (script.url?.startsWith('chrome-extension://')) {
            return false;
        }
        return Helpers.Timing.timestampIsInBounds(context.bounds, script.ts) ||
            (script.request && Helpers.Timing.eventIsInBounds(script.request, context.bounds));
    });
    const legacyJavaScriptResults = new Map();
    const wastedBytesByRequestId = new Map();
    for (const script of scripts) {
        if (!script.content || script.content.length < BYTE_THRESHOLD) {
            continue;
        }
        const result = detectLegacyJavaScript(script.content, script.sourceMap);
        if (result.estimatedByteSavings < BYTE_THRESHOLD) {
            continue;
        }
        // Translate from resource size to transfer size.
        const compressionRatio = estimateCompressionRatioForScript(script);
        const transferSize = Math.round(result.estimatedByteSavings * compressionRatio);
        result.estimatedByteSavings = transferSize;
        legacyJavaScriptResults.set(script, result);
        if (script.request) {
            const requestId = script.request.args.data.requestId;
            wastedBytesByRequestId.set(requestId, transferSize);
        }
    }
    const sorted = new Map([...legacyJavaScriptResults].sort((a, b) => b[1].estimatedByteSavings - a[1].estimatedByteSavings));
    return finalize({
        legacyJavaScriptResults: sorted,
        metricSavings: metricSavingsForWastedBytes(wastedBytesByRequestId, context),
        wastedBytes: wastedBytesByRequestId.values().reduce((acc, cur) => acc + cur, 0),
    });
}
export function createOverlays(model) {
    return [...model.legacyJavaScriptResults.keys()].map(script => script.request).filter(e => !!e).map(request => {
        return {
            type: 'ENTRY_OUTLINE',
            entry: request,
            outlineReason: 'ERROR',
        };
    });
}
//# sourceMappingURL=LegacyJavaScript.js.map