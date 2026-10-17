// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as ThirdPartyWeb from '../../../third_party/third-party-web/third-party-web.js';
import * as Extras from '../extras/extras.js';
import * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { InsightCategory, InsightKeys, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides details about the code on a web page that the user doesn't control (referred to as "third-party code").
     */
    title: '3rd parties',
    /**
     * @description Description of a DevTools insight that identifies the code on the page that the user doesn't control.
     * This is displayed after a user expands the section to see more. No character length limits.
     */
    description: `3rd party code can significantly impact load performance. [Reduce and defer loading of 3rd party code](https://developer.chrome.com/docs/performance/insights/third-parties) to prioritize your page’s content.`,
    /**
     * @description Label for a table column that displays the name of a third-party provider.
     */
    columnThirdParty: '3rd party',
    /**
     * @description Label for a column in a data table; entries will be the download size of a web resource in kilobytes.
     */
    columnTransferSize: 'Transfer size',
    /**
     * @description Label for a table column that displays how much time each row spent running on the main thread, entries will be the number of milliseconds spent.
     */
    columnMainThreadTime: 'Main thread time',
    /**
     * @description Text block indicating that no third party content was detected on the page.
     */
    noThirdParties: 'No third parties found',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/ThirdParties.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
function getRelatedEvents(summaries, firstPartyEntity) {
    const relatedEvents = [];
    for (const summary of summaries) {
        if (summary.entity !== firstPartyEntity) {
            relatedEvents.push(...summary.relatedEvents);
        }
    }
    return relatedEvents;
}
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.THIRD_PARTIES,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/third-parties',
        category: InsightCategory.ALL,
        state: partialModel.entitySummaries.find(summary => summary.entity !== partialModel.firstPartyEntity) ?
            'informative' :
            'pass',
        ...partialModel,
    };
}
export function isThirdPartyInsight(model) {
    return model.insightKey === InsightKeys.THIRD_PARTIES;
}
export function generateInsight(data, context) {
    const entitySummaries = Extras.ThirdParties.summarizeByThirdParty(data, context.bounds);
    let firstPartyUrl = data.Meta.mainFrameURL;
    if (context.navigation && !Types.Events.isSoftNavigationStart(context.navigation)) {
        firstPartyUrl = context.navigation.args.data?.documentLoaderURL ?? firstPartyUrl;
    }
    const firstPartyEntity = ThirdPartyWeb.ThirdPartyWeb.getEntity(firstPartyUrl) ||
        Handlers.Helpers.makeUpEntity(data.Renderer.entityMappings.createdEntityCache, firstPartyUrl);
    return finalize({
        relatedEvents: getRelatedEvents(entitySummaries, firstPartyEntity),
        firstPartyEntity,
        entitySummaries,
    });
}
export function createOverlaysForSummary(summary) {
    const overlays = [];
    for (const event of summary.relatedEvents) {
        // The events found for a third party can be vast, as they gather every
        // single main thread task along with everything else on the page. If the
        // main thread is busy with large icicles, we can easily create tens of
        // thousands of overlays. Therefore, only create overlays for events of at least 1ms.
        if (event.dur === undefined || event.dur < 1_000) {
            continue;
        }
        const overlay = {
            type: 'ENTRY_OUTLINE',
            entry: event,
            outlineReason: 'INFO',
        };
        overlays.push(overlay);
    }
    return overlays;
}
export function createOverlays(model) {
    const overlays = [];
    const summaries = model.entitySummaries ?? [];
    for (const summary of summaries) {
        if (summary.entity === model.firstPartyEntity) {
            continue;
        }
        const summaryOverlays = createOverlaysForSummary(summary);
        overlays.push(...summaryOverlays);
    }
    return overlays;
}
//# sourceMappingURL=ThirdParties.js.map