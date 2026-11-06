// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { InsightCategory, InsightKeys, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides details about slow CSS selectors.
     */
    title: 'CSS selector costs',
    /**
     * @description Text to describe how to improve the performance of CSS selectors.
     */
    description: 'If recalculate style costs remain high, selector optimization can reduce them. [Optimize the selectors](https://developer.chrome.com/docs/performance/insights/slow-css-selector) with both high elapsed time and high slow-path %. Simpler selectors, fewer selectors, a smaller DOM, and a shallower DOM will all reduce matching costs.',
    /**
     * @description Column name for count of elements that the engine attempted to match against a style rule.
     */
    matchAttempts: 'Match attempts',
    /**
     * @description Column name for count of elements that matched a style rule.
     */
    matchCount: 'Match count',
    /**
     * @description Column name for elapsed time spent computing a style rule.
     */
    elapsed: 'Elapsed time',
    /**
     * @description Column name for the selectors that took the longest amount of time/effort.
     */
    topSelectors: 'Top selectors',
    /**
     * @description Column name for a total sum.
     */
    total: 'Total',
    /**
     * @description Text status indicating that no CSS selector data was found.
     */
    enableSelectorData: 'No CSS selector data was found. CSS selector stats need to be enabled in the Performance panel settings.',
    /**
     * @description Top CSS selector when ranked by elapsed time in ms.
     */
    topSelectorElapsedTime: 'Top selector elapsed time',
    /**
     * @description Top CSS selector when ranked by match attempt.
     */
    topSelectorMatchAttempt: 'Top selector match attempt',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/SlowCSSSelector.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const slowCSSSelectorThreshold = 500; // 500us threshold for slow selectors
function aggregateSelectorStats(data, context) {
    const selectorMap = new Map();
    for (const [event, value] of data.dataForRecalcStyleEvent) {
        if (event.args.beginData?.frame !== context.frameId) {
            continue;
        }
        if (!Helpers.Timing.eventIsInBounds(event, context.bounds)) {
            continue;
        }
        for (const timing of value.timings) {
            const key = timing[Types.Events.SelectorTimingsKey.Selector] + '_' + timing[Types.Events.SelectorTimingsKey.StyleSheetId];
            const findTiming = selectorMap.get(key);
            if (findTiming !== undefined) {
                findTiming[Types.Events.SelectorTimingsKey.Elapsed] += timing[Types.Events.SelectorTimingsKey.Elapsed];
                findTiming[Types.Events.SelectorTimingsKey.FastRejectCount] +=
                    timing[Types.Events.SelectorTimingsKey.FastRejectCount];
                findTiming[Types.Events.SelectorTimingsKey.MatchAttempts] +=
                    timing[Types.Events.SelectorTimingsKey.MatchAttempts];
                findTiming[Types.Events.SelectorTimingsKey.MatchCount] += timing[Types.Events.SelectorTimingsKey.MatchCount];
            }
            else {
                selectorMap.set(key, { ...timing });
            }
        }
    }
    return [...selectorMap.values()];
}
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.SLOW_CSS_SELECTOR,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/slow-css-selector',
        category: InsightCategory.ALL,
        state: partialModel.topSelectorElapsedMs && partialModel.topSelectorMatchAttempts ? 'informative' : 'pass',
        ...partialModel,
    };
}
export function isSlowCSSSelectorInsight(model) {
    return model.insightKey === InsightKeys.SLOW_CSS_SELECTOR;
}
export function generateInsight(data, context) {
    const selectorStatsData = data.SelectorStats;
    if (!selectorStatsData) {
        throw new Error('no selector stats data');
    }
    const selectorTimings = aggregateSelectorStats(selectorStatsData, context);
    let totalElapsedUs = 0;
    let totalMatchAttempts = 0;
    let totalMatchCount = 0;
    selectorTimings.map(timing => {
        totalElapsedUs += timing[Types.Events.SelectorTimingsKey.Elapsed];
        totalMatchAttempts += timing[Types.Events.SelectorTimingsKey.MatchAttempts];
        totalMatchCount += timing[Types.Events.SelectorTimingsKey.MatchCount];
    });
    let topSelectorElapsedMs = null;
    let topSelectorMatchAttempts = null;
    if (selectorTimings.length > 0) {
        // find the selector with most elapsed time
        topSelectorElapsedMs = selectorTimings.reduce((a, b) => {
            return a[Types.Events.SelectorTimingsKey.Elapsed] > b[Types.Events.SelectorTimingsKey.Elapsed] ? a : b;
        });
        // check if the slowest selector is slow enough to trigger insights info
        if (topSelectorElapsedMs &&
            topSelectorElapsedMs[Types.Events.SelectorTimingsKey.Elapsed] < slowCSSSelectorThreshold) {
            topSelectorElapsedMs = null;
        }
        // find the selector with most match attempts
        topSelectorMatchAttempts = selectorTimings.reduce((a, b) => {
            return a[Types.Events.SelectorTimingsKey.MatchAttempts] > b[Types.Events.SelectorTimingsKey.MatchAttempts] ? a :
                b;
        });
    }
    return finalize({
        // TODO: should we identify RecalcStyle events as linked to this insight?
        relatedEvents: [],
        totalElapsedMs: Types.Timing.Milli(totalElapsedUs / 1000.0),
        totalMatchAttempts,
        totalMatchCount,
        topSelectorElapsedMs,
        topSelectorMatchAttempts,
    });
}
export function createOverlays(_) {
    return [];
}
//# sourceMappingURL=SlowCSSSelector.js.map