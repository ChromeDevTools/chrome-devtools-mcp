// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as Handlers from '../handlers/handlers.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { InsightCategory, InsightKeys, InsightWarning, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides details about if the page's viewport is optimized for mobile viewing.
     */
    title: 'Optimize viewport for mobile',
    /**
     * @description Text to tell the user how a viewport meta element can improve performance. \xa0 is a non-breaking space
     */
    description: 'Tap interactions may be [delayed by up to 300\xA0ms](https://developer.chrome.com/docs/performance/insights/viewport) if the viewport isn’t optimized for mobile',
    /**
     * @description Text for a label describing the portion of an interaction event that was delayed due to a bad mobile viewport.
     */
    mobileTapDelayLabel: 'Mobile tap delay',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/Viewport.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.VIEWPORT,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/viewport',
        category: InsightCategory.INP,
        state: partialModel.mobileOptimized === false ? 'fail' : 'pass',
        ...partialModel,
    };
}
export function isViewportInsight(model) {
    return model.insightKey === InsightKeys.VIEWPORT;
}
export function generateInsight(data, context) {
    const viewportEvent = data.UserInteractions.parseMetaViewportEvents.find(event => {
        if (event.args.data.frame !== context.frameId) {
            return false;
        }
        return Helpers.Timing.eventIsInBounds(event, context.bounds);
    });
    const compositorEvents = data.UserInteractions.beginCommitCompositorFrameEvents.filter(event => {
        if (event.args.frame !== context.frameId) {
            return false;
        }
        // Commit compositor frame events can be emitted before the viewport tag is parsed.
        // We shouldn't count these since the browser hasn't had time to make the viewport mobile optimized.
        if (viewportEvent && event.ts < viewportEvent.ts) {
            return false;
        }
        return Helpers.Timing.eventIsInBounds(event, context.bounds);
    });
    if (!compositorEvents.length) {
        // Trace doesn't have the data we need.
        return finalize({
            mobileOptimized: null,
            warnings: [InsightWarning.NO_LAYOUT],
        });
    }
    // Returns true only if all events are mobile optimized.
    for (const event of compositorEvents) {
        if (!event.args.is_mobile_optimized) {
            // Grab all the pointer events with at least 50ms of input delay.
            const longPointerInteractions = [...data.UserInteractions.interactionsOverThreshold.values()].filter(interaction => Handlers.ModelHandlers.UserInteractions.categoryOfInteraction(interaction) === 'POINTER' &&
                interaction.inputDelay >= 50_000);
            // The actual impact varies between 0 and 300.
            // Using inputDelay as the closest thing we have for measuring this, though inputDelay may be high for other reasons.
            // b/371566378#comment8
            const inputDelay = Math.max(0, ...longPointerInteractions.map(interaction => interaction.inputDelay)) / 1000;
            const inpMetricSavings = Platform.NumberUtilities.clamp(inputDelay, 0, 300);
            return finalize({
                mobileOptimized: false,
                viewportEvent,
                longPointerInteractions,
                metricSavings: { INP: inpMetricSavings },
            });
        }
    }
    return finalize({
        mobileOptimized: true,
        viewportEvent,
    });
}
export function createOverlays(model) {
    if (!model.longPointerInteractions) {
        return [];
    }
    return model.longPointerInteractions.map(interaction => {
        const delay = Math.min(interaction.inputDelay, 300 * 1000);
        const bounds = Helpers.Timing.traceWindowFromMicroSeconds(Types.Timing.Micro(interaction.ts), Types.Timing.Micro(interaction.ts + delay));
        return {
            type: 'TIMESPAN_BREAKDOWN',
            entry: interaction,
            sections: [{ bounds, label: i18nString(UIStrings.mobileTapDelayLabel), showDuration: true }],
            renderLocation: 'ABOVE_EVENT',
        };
    });
}
//# sourceMappingURL=Viewport.js.map