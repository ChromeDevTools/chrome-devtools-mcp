// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { InsightCategory, InsightKeys, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides details about the fonts used on the page, and the value of their `font-display` properties.
     */
    title: 'Font display',
    /**
     * @description Text to tell the user about the font-display CSS feature to help improve a the UX of a page.
     */
    description: 'Consider setting [`font-display`](https://developer.chrome.com/docs/performance/insights/font-display) to `swap` or `optional` to ensure text is consistently visible. `swap` can be further optimized to mitigate layout shifts with [font metric overrides](https://developer.chrome.com/blog/font-fallbacks).',
    /**
     * @description Column for a font loaded by the page to render text.
     */
    fontColumn: 'Font',
    /**
     * @description Column for the amount of time wasted.
     */
    wastedTimeColumn: 'Wasted time',
    /**
     * @description Message shown when no fonts with suboptimal font-display are found.
     */
    noFonts: 'No fonts with suboptimal font-display found',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/FontDisplay.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.FONT_DISPLAY,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/font-display',
        category: InsightCategory.INP,
        state: partialModel.fonts.find(font => font.wastedTime > 0) ? 'fail' : 'pass',
        ...partialModel,
    };
}
export function isFontDisplayInsight(model) {
    return model.insightKey === InsightKeys.FONT_DISPLAY;
}
export function generateInsight(data, context) {
    const fonts = [];
    for (const remoteFont of data.LayoutShifts.remoteFonts) {
        const event = remoteFont.beginRemoteFontLoadEvent;
        if (!Helpers.Timing.eventIsInBounds(event, context.bounds)) {
            continue;
        }
        const requestId = `${event.pid}.${event.args.id}`;
        const request = data.NetworkRequests.byId.get(requestId);
        if (!request) {
            continue;
        }
        if (!/^(block|fallback|auto)$/.test(remoteFont.display)) {
            continue;
        }
        const wastedTimeMicro = Types.Timing.Micro(request.args.data.syntheticData.finishTime - request.args.data.syntheticData.sendStartTime);
        // TODO(crbug.com/352244504): should really end at the time of the next Commit trace event.
        let wastedTime = Platform.NumberUtilities.floor(Helpers.Timing.microToMilli(wastedTimeMicro), 1 / 5);
        if (wastedTime === 0) {
            continue;
        }
        // All browsers wait for no more than 3s.
        wastedTime = Math.min(wastedTime, 3000);
        fonts.push({
            name: remoteFont.name,
            request,
            display: remoteFont.display,
            wastedTime,
        });
    }
    fonts.sort((a, b) => b.wastedTime - a.wastedTime);
    const savings = Math.max(...fonts.map(f => f.wastedTime));
    return finalize({
        relatedEvents: fonts.map(f => f.request),
        fonts,
        metricSavings: { FCP: savings },
    });
}
export function createOverlays(model) {
    return model.fonts.map(font => ({
        type: 'ENTRY_OUTLINE',
        entry: font.request,
        outlineReason: font.wastedTime ? 'ERROR' : 'INFO',
    }));
}
//# sourceMappingURL=FontDisplay.js.map