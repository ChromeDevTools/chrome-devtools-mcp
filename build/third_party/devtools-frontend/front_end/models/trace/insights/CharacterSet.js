// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import { InsightCategory, InsightKeys, InsightWarning, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that checks whether the page declares a character encoding early enough.
     */
    title: 'Declare a character encoding',
    /**
     * @description Description of an insight that checks whether the page has a proper character encoding declaration via HTTP header or early meta tag.
     */
    description: 'A character encoding declaration is required. It can be done with a meta charset tag in the first 1024 bytes of the HTML or in the Content-Type HTTP response header. [Learn more about declaring the character encoding](https://developer.chrome.com/docs/insights/charset/).',
    /**
     * @description Text to tell the user that the charset is declared in the Content-Type HTTP response header.
     */
    passingHttpHeader: 'Declares charset in HTTP header',
    /**
     * @description Text to tell the user that the charset is NOT declared in the Content-Type HTTP response header.
     */
    failedHttpHeader: 'Doesn’t declare charset in HTTP header',
    /**
     * @description Text to tell the user that a meta charset tag was found in the first 1024 bytes of the HTML.
     */
    passingMetaCharsetEarly: 'Declares charset using a meta tag in the first 1024 bytes',
    /**
     * @description Text to tell the user that a meta charset tag was found, but too late in the HTML.
     */
    failedMetaCharsetLate: 'Declares charset using a meta tag after the first 1024 bytes',
    /**
     * @description Text to tell the user that no meta charset tag was found in the HTML.
     */
    failedMetaCharsetMissing: 'Doesn’t declare charset using a meta tag',
    /**
     * @description Text to tell the user that trace data did not include the Blink signal for meta charset.
     */
    failedMetaCharsetUnknown: 'Couldn’t determine meta charset declaration from trace',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/CharacterSet.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const CHARSET_HTTP_REGEX = /charset\s*=\s*[a-zA-Z0-9\-_:.()]{2,}/i;
export function isCharacterSetInsight(model) {
    return model.insightKey === InsightKeys.CHARACTER_SET;
}
function finalize(partialModel) {
    let hasFailure = false;
    if (partialModel.data) {
        hasFailure = !partialModel.data.checklist.httpCharset.value && !partialModel.data.checklist.metaCharset.value;
    }
    return {
        insightKey: InsightKeys.CHARACTER_SET,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/insights/charset/',
        category: InsightCategory.ALL,
        state: hasFailure ? 'fail' : 'pass',
        ...partialModel,
    };
}
function hasCharsetInContentType(request) {
    if (!request.args.data.responseHeaders) {
        return false;
    }
    for (const header of request.args.data.responseHeaders) {
        if (header.name.toLowerCase() === 'content-type') {
            return CHARSET_HTTP_REGEX.test(header.value);
        }
    }
    return false;
}
function findMetaCharsetDisposition(data, context) {
    if (!context.navigation) {
        return undefined;
    }
    return data.PageLoadMetrics.metaCharsetCheckEventsByNavigation.get(context.navigation)
        ?.at(-1)
        ?.args.data?.disposition;
}
function metaCharsetLabel(disposition) {
    switch (disposition) {
        case 'found-in-first-1024-bytes':
            return i18nString(UIStrings.passingMetaCharsetEarly);
        case 'found-after-first-1024-bytes':
            return i18nString(UIStrings.failedMetaCharsetLate);
        case 'not-found':
            return i18nString(UIStrings.failedMetaCharsetMissing);
        default:
            return i18nString(UIStrings.failedMetaCharsetUnknown);
    }
}
export function generateInsight(data, context) {
    if (!context.navigation || !('navigationId' in context)) {
        return finalize({});
    }
    const documentRequest = data.NetworkRequests.byId.get(context.navigationId);
    if (!documentRequest) {
        return finalize({ warnings: [InsightWarning.NO_DOCUMENT_REQUEST] });
    }
    const hasHttpCharset = hasCharsetInContentType(documentRequest);
    const metaCharsetDisposition = findMetaCharsetDisposition(data, context);
    const hasMetaCharsetInFirst1024Bytes = metaCharsetDisposition === 'found-in-first-1024-bytes';
    return finalize({
        relatedEvents: [documentRequest],
        data: {
            hasHttpCharset,
            metaCharsetDisposition,
            documentRequest,
            checklist: {
                httpCharset: {
                    label: hasHttpCharset ? i18nString(UIStrings.passingHttpHeader) : i18nString(UIStrings.failedHttpHeader),
                    value: hasHttpCharset,
                },
                metaCharset: {
                    label: metaCharsetLabel(metaCharsetDisposition),
                    value: hasMetaCharsetInFirst1024Bytes,
                },
            },
        },
    });
}
export function createOverlays(model) {
    if (!model.data?.documentRequest) {
        return [];
    }
    return [{
            type: 'ENTRY_SELECTED',
            entry: model.data.documentRequest,
        }];
}
//# sourceMappingURL=CharacterSet.js.map