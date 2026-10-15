// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Handlers from '../handlers/handlers.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { calculateDocFirstByteTs } from './Common.js';
import { InsightCategory, InsightKeys, InsightWarning, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides details about the LCP metric, and the network requests necessary to load it. Details how the LCP request was discoverable - in other words, the path necessary to load it (ex: network requests, JavaScript).
     */
    title: 'LCP request discovery',
    /**
     * @description Description of an insight that provides details about the LCP metric, and the network requests necessary to load it.
     */
    description: '[Optimize LCP](https://developer.chrome.com/docs/performance/insights/lcp-discovery) by making the LCP image discoverable from the HTML immediately, and avoiding lazy-loading',
    /**
     * @description Text to tell the user how long after the earliest discovery time their LCP element loaded.
     * @example {401ms} PH1
     */
    lcpLoadDelay: 'LCP image loaded {PH1} after earliest start point',
    /**
     * @description Text to tell the user that a fetchpriority property value of "high" is applied to the LCP request.
     */
    fetchPriorityApplied: 'fetchpriority=high applied',
    /**
     * @description Text to tell the user that a fetchpriority property value of "high" should be applied to the LCP request.
     */
    fetchPriorityShouldBeApplied: 'fetchpriority=high should be applied',
    /**
     * @description Text to tell the user that a fetchpriority property value of "high" should be applied to the preload request that loads the LCP image.
     */
    fetchPriorityShouldBeAppliedToImagePreload: 'fetchpriority=high should be applied to the image preload request',
    /**
     * @description Text to tell the user that the LCP request is discoverable in the initial document.
     */
    requestDiscoverable: 'Request is discoverable in initial document',
    /**
     * @description Text to tell the user that LCP resources should avoid using loading=lazy.
     */
    lazyLoadNotApplied: 'LCP resources shouldn’t use loading=lazy',
    /**
     * @description Text status indicating that the Largest Contentful Paint (LCP) metric timing was not found. "LCP" is an acronym and should not be translated.
     */
    noLcp: 'No LCP detected',
    /**
     * @description Text status indicating that the Largest Contentful Paint (LCP) metric was text rather than an image. "LCP" is an acronym and should not be translated.
     */
    noLcpResource: 'No LCP resource detected because the LCP isn’t an image',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/LCPDiscovery.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export function isLCPDiscoveryInsight(model) {
    return model.insightKey === 'LCPDiscovery';
}
function finalize(partialModel) {
    const relatedEvents = partialModel.lcpEvent && partialModel.lcpRequest ?
        // TODO: add entire request initiator chain?
        [partialModel.lcpEvent, partialModel.lcpRequest] :
        [];
    return {
        insightKey: InsightKeys.LCP_DISCOVERY,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/lcp-discovery',
        category: InsightCategory.LCP,
        state: partialModel.lcpRequest && partialModel.checklist &&
            (!partialModel.checklist.eagerlyLoaded.value || !partialModel.checklist.requestDiscoverable.value ||
                !partialModel.checklist.priorityHinted.value) ?
            'fail' :
            'pass',
        ...partialModel,
        relatedEvents,
    };
}
export function generateInsight(data, context) {
    if (!context.navigation || !('navigationId' in context)) {
        return finalize({});
    }
    const networkRequests = data.NetworkRequests;
    const frameMetrics = data.PageLoadMetrics.metricScoresByFrameId.get(context.frameId);
    if (!frameMetrics) {
        throw new Error('no frame metrics');
    }
    const navMetrics = frameMetrics.get(context.navigation);
    if (!navMetrics) {
        throw new Error('no navigation metrics');
    }
    const metricScore = navMetrics.get(Handlers.ModelHandlers.PageLoadMetrics.MetricName.LCP);
    const lcpEvent = metricScore?.event;
    if (!lcpEvent || !Types.Events.isAnyLargestContentfulPaintCandidate(lcpEvent)) {
        return finalize({ warnings: [InsightWarning.NO_LCP] });
    }
    const docRequest = networkRequests.byId.get(context.navigationId);
    if (!docRequest) {
        return finalize({ warnings: [InsightWarning.NO_DOCUMENT_REQUEST] });
    }
    const lcpRequest = data.LargestImagePaint.lcpRequestByNavigationId.get(context.navigationId);
    if (!lcpRequest) {
        return finalize({ lcpEvent });
    }
    const initiatorUrl = lcpRequest.args.data.initiator?.url;
    const initiatedByMainDoc = lcpRequest?.args.data.initiator?.type === 'parser' && docRequest.args.data.url === initiatorUrl;
    const imgPreloadedOrFoundInHTML = lcpRequest?.args.data.isLinkPreload || initiatedByMainDoc;
    const imageFetchPriorityHint = lcpRequest?.args.data.fetchPriorityHint;
    // This is the earliest discovery time an LCP request could have - it's TTFB (as an absolute timestamp).
    const earliestDiscoveryTime = calculateDocFirstByteTs(docRequest);
    const priorityHintFound = imageFetchPriorityHint === 'high';
    const missingPriorityHintLabel = lcpRequest.args.data.isLinkPreload ?
        i18nString(UIStrings.fetchPriorityShouldBeAppliedToImagePreload) :
        i18nString(UIStrings.fetchPriorityShouldBeApplied);
    // A lazy-loaded LCP image can still be eagerly loaded when its request is
    // initiated by a preload.
    const lcpNotLazyLoaded = lcpEvent.args.data?.loadingAttr !== 'lazy' || lcpRequest.args.data.isLinkPreload;
    return finalize({
        lcpEvent,
        lcpRequest,
        earliestDiscoveryTimeTs: earliestDiscoveryTime ? Types.Timing.Micro(earliestDiscoveryTime) : undefined,
        checklist: {
            priorityHinted: {
                label: priorityHintFound ? i18nString(UIStrings.fetchPriorityApplied) : missingPriorityHintLabel,
                value: priorityHintFound,
            },
            requestDiscoverable: { label: i18nString(UIStrings.requestDiscoverable), value: imgPreloadedOrFoundInHTML },
            eagerlyLoaded: { label: i18nString(UIStrings.lazyLoadNotApplied), value: lcpNotLazyLoaded },
        },
    });
}
/**
 * TODO: this extra transformation (getImageData) should not be necessary.
 */
export function getImageData(model) {
    if (!model.lcpRequest || !model.checklist) {
        return null;
    }
    const shouldIncreasePriorityHint = !model.checklist.priorityHinted.value;
    const shouldPreloadImage = !model.checklist.requestDiscoverable.value;
    const shouldRemoveLazyLoading = !model.checklist.eagerlyLoaded.value;
    const imageLCP = shouldIncreasePriorityHint !== undefined && shouldPreloadImage !== undefined &&
        shouldRemoveLazyLoading !== undefined;
    // Shouldn't render anything if lcp insight is null or lcp is text.
    if (!imageLCP) {
        return null;
    }
    const data = {
        checklist: model.checklist,
        request: model.lcpRequest,
        discoveryDelay: null,
        estimatedSavings: model.metricSavings?.LCP ?? null,
    };
    if (model.earliestDiscoveryTimeTs && model.lcpRequest) {
        const discoveryDelay = model.lcpRequest.ts - model.earliestDiscoveryTimeTs;
        data.discoveryDelay = Types.Timing.Micro(discoveryDelay);
    }
    return data;
}
export function createOverlays(model) {
    const imageResults = getImageData(model);
    if (!imageResults?.discoveryDelay) {
        return [];
    }
    const delay = Helpers.Timing.traceWindowFromMicroSeconds(Types.Timing.Micro(imageResults.request.ts - imageResults.discoveryDelay), imageResults.request.ts);
    return [
        {
            type: 'ENTRY_OUTLINE',
            entry: imageResults.request,
            outlineReason: 'ERROR',
        },
        {
            type: 'CANDY_STRIPED_TIME_RANGE',
            bounds: delay,
            entry: imageResults.request,
        },
        {
            type: 'TIMESPAN_BREAKDOWN',
            sections: [{
                    bounds: delay,
                    // This is overridden in the component.
                    label: `${imageResults.discoveryDelay} microseconds`,
                    showDuration: false,
                }],
            entry: imageResults.request,
            renderLocation: 'ABOVE_EVENT',
        },
    ];
}
//# sourceMappingURL=LCPDiscovery.js.map