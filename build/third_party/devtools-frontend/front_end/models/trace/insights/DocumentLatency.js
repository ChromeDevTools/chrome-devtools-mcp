// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { isRequestCompressed } from './Common.js';
import { InsightCategory, InsightKeys, InsightWarning, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that provides a breakdown for how long it took to download the main document.
     */
    title: 'Document request latency',
    /**
     * @description Description of an insight that provides a breakdown for how long it took to download the main document.
     */
    description: 'Your first network request is the most important. [Reduce its latency](https://developer.chrome.com/docs/performance/insights/document-latency) by avoiding redirects, ensuring a fast server response, and enabling text compression.',
    /**
     * @description Text to tell the user that the document request does not have redirects.
     */
    passingRedirects: 'Avoids redirects',
    /**
     * @description Text to tell the user that the document request had redirects.
     * @example {3} PH1
     * @example {1000 ms} PH2
     */
    failedRedirects: 'Had redirects ({PH1} redirects, +{PH2})',
    /**
     * @description Text to tell the user that the time starting the document request to when the server started responding is acceptable.
     * @example {600 ms} PH1
     */
    passingServerResponseTime: 'Server responds quickly (observed {PH1})',
    /**
     * @description Text to tell the user that the time starting the document request to when the server started responding is not acceptable.
     * @example {601 ms} PH1
     */
    failedServerResponseTime: 'Server responded slowly (observed {PH1})',
    /**
     * @description Text to tell the user that text compression (like gzip) was applied.
     */
    passingTextCompression: 'Applies text compression',
    /**
     * @description Text to tell the user that text compression (like gzip) was not applied.
     */
    failedTextCompression: 'No compression applied',
    /**
     * @description Text for a label describing a network request event as having redirects.
     */
    redirectsLabel: 'Redirects',
    /**
     * @description Text for a label describing a network request event as taking too long to start delivery by the server.
     */
    serverResponseTimeLabel: 'Server response time',
    /**
     * @description Text for a label describing a network request event as taking longer to download because it wasn't compressed.
     */
    uncompressedDownload: 'Uncompressed download',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/DocumentLatency.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
// Due to the way that DevTools throttling works we cannot see if server response took less than ~570ms.
// We set our failure threshold to 600ms to avoid those false positives but we want devs to shoot for 100ms.
const TOO_SLOW_THRESHOLD_MS = 600;
const TARGET_MS = 100;
// Threshold for compression savings.
const IGNORE_THRESHOLD_IN_BYTES = 1400;
export function isDocumentLatencyInsight(x) {
    return x.insightKey === 'DocumentLatency';
}
function getServerResponseTime(request) {
    // For technical reasons, Lightrider does not have `sendEnd` timing values. The
    // closest we can get to the server response time is from a header that Lightrider
    // sets.
    // @ts-expect-error
    const isLightrider = globalThis.isLightrider;
    if (isLightrider) {
        return request.args.data.lrServerResponseTime ?? null;
    }
    const timing = request.args.data.timing;
    if (!timing) {
        return null;
    }
    const ms = Helpers.Timing.microToMilli(request.args.data.syntheticData.serverResponseTime);
    return Math.round(ms);
}
function getCompressionSavings(request) {
    const isCompressed = isRequestCompressed(request);
    if (isCompressed) {
        return 0;
    }
    // We don't know how many bytes this asset used on the network, but we can guess it was
    // roughly the size of the content gzipped.
    // See https://developers.google.com/web/fundamentals/performance/optimizing-content-efficiency/optimize-encoding-and-transfer for specific CSS/Script examples
    // See https://discuss.httparchive.org/t/file-size-and-compression-savings/145 for fallback multipliers
    // See https://letstalkaboutwebperf.com/en/gzip-brotli-server-config/ for MIME types to compress
    const originalSize = request.args.data.decodedBodyLength;
    let estimatedSavings = 0;
    switch (request.args.data.mimeType) {
        case 'text/css':
            // Stylesheets tend to compress extremely well.
            estimatedSavings = Math.round(originalSize * 0.8);
            break;
        case 'text/html':
        case 'text/javascript':
            // Scripts and HTML compress fairly well too.
            estimatedSavings = Math.round(originalSize * 0.67);
            break;
        case 'text/plain':
        case 'text/xml':
        case 'text/x-component':
        case 'application/javascript':
        case 'application/json':
        case 'application/manifest+json':
        case 'application/vnd.api+json':
        case 'application/xml':
        case 'application/xhtml+xml':
        case 'application/rss+xml':
        case 'application/atom+xml':
        case 'application/vnd.ms-fontobject':
        case 'application/x-font-ttf':
        case 'application/x-font-opentype':
        case 'application/x-font-truetype':
        case 'image/svg+xml':
        case 'image/x-icon':
        case 'image/vnd.microsoft.icon':
        case 'font/ttf':
        case 'font/eot':
        case 'font/otf':
        case 'font/opentype':
            // Use the average savings in HTTPArchive.
            estimatedSavings = Math.round(originalSize * 0.5);
            break;
        default: // Any other MIME types are likely already compressed.
    }
    // Check if the estimated savings are greater than the byte ignore threshold.
    // Note that the estimated gzip savings are always more than 10%, so there is
    // no percent threshold.
    return estimatedSavings < IGNORE_THRESHOLD_IN_BYTES ? 0 : estimatedSavings;
}
function finalize(partialModel) {
    let hasFailure = false;
    if (partialModel.data) {
        hasFailure = !partialModel.data.checklist.usesCompression.value ||
            !partialModel.data.checklist.serverResponseIsFast.value || !partialModel.data.checklist.noRedirects.value;
    }
    return {
        insightKey: InsightKeys.DOCUMENT_LATENCY,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/document-latency',
        category: InsightCategory.ALL,
        state: hasFailure ? 'fail' : 'pass',
        ...partialModel,
    };
}
export function generateInsight(data, context) {
    if (!context.navigation || !('navigationId' in context)) {
        return finalize({});
    }
    const millisToString = context.options.insightTimeFormatters?.milli ?? i18n.TimeUtilities.millisToString;
    const documentRequest = data.NetworkRequests.byId.get(context.navigationId);
    if (!documentRequest) {
        return finalize({ warnings: [InsightWarning.NO_DOCUMENT_REQUEST] });
    }
    const serverResponseTime = getServerResponseTime(documentRequest);
    if (serverResponseTime === null) {
        throw new Error('missing document request timing');
    }
    const serverResponseTooSlow = serverResponseTime > TOO_SLOW_THRESHOLD_MS;
    let overallSavingsMs = 0;
    if (serverResponseTime > TOO_SLOW_THRESHOLD_MS) {
        overallSavingsMs = Math.max(serverResponseTime - TARGET_MS, 0);
    }
    const redirectDuration = Math.round(documentRequest.args.data.syntheticData.redirectionDuration / 1000);
    overallSavingsMs += redirectDuration;
    const metricSavings = {
        FCP: overallSavingsMs,
        LCP: overallSavingsMs,
    };
    const uncompressedResponseBytes = getCompressionSavings(documentRequest);
    const noRedirects = redirectDuration === 0;
    const serverResponseIsFast = !serverResponseTooSlow;
    const usesCompression = uncompressedResponseBytes === 0;
    return finalize({
        relatedEvents: [documentRequest],
        data: {
            serverResponseTime,
            redirectDuration: Types.Timing.Milli(redirectDuration),
            uncompressedResponseBytes,
            documentRequest,
            checklist: {
                noRedirects: {
                    label: noRedirects ? i18nString(UIStrings.passingRedirects) : i18nString(UIStrings.failedRedirects, {
                        PH1: documentRequest.args.data.redirects.length,
                        PH2: millisToString(redirectDuration),
                    }),
                    value: noRedirects,
                },
                serverResponseIsFast: {
                    label: serverResponseIsFast ?
                        i18nString(UIStrings.passingServerResponseTime, { PH1: millisToString(serverResponseTime) }) :
                        i18nString(UIStrings.failedServerResponseTime, { PH1: millisToString(serverResponseTime) }),
                    value: serverResponseIsFast,
                },
                usesCompression: {
                    label: usesCompression ? i18nString(UIStrings.passingTextCompression) :
                        i18nString(UIStrings.failedTextCompression),
                    value: usesCompression,
                },
            },
        },
        metricSavings,
        wastedBytes: uncompressedResponseBytes,
    });
}
export function createOverlays(model) {
    if (!model.data?.documentRequest) {
        return [];
    }
    const overlays = [];
    const event = model.data.documentRequest;
    const redirectDurationMicro = Helpers.Timing.milliToMicro(model.data.redirectDuration);
    const sections = [];
    if (model.data.redirectDuration) {
        const bounds = Helpers.Timing.traceWindowFromMicroSeconds(event.ts, (event.ts + redirectDurationMicro));
        sections.push({ bounds, label: i18nString(UIStrings.redirectsLabel), showDuration: true });
        overlays.push({ type: 'CANDY_STRIPED_TIME_RANGE', bounds, entry: event });
    }
    if (!model.data.checklist.serverResponseIsFast.value) {
        const serverResponseTimeMicro = Helpers.Timing.milliToMicro(model.data.serverResponseTime);
        // NOTE: NetworkRequestHandlers never makes a synthetic network request event if `timing` is missing.
        const sendEnd = event.args.data.timing?.sendEnd ?? Types.Timing.Milli(0);
        const sendEndMicro = Helpers.Timing.milliToMicro(sendEnd);
        const bounds = Helpers.Timing.traceWindowFromMicroSeconds(sendEndMicro, (sendEndMicro + serverResponseTimeMicro));
        sections.push({ bounds, label: i18nString(UIStrings.serverResponseTimeLabel), showDuration: true });
    }
    if (model.data.uncompressedResponseBytes) {
        const bounds = Helpers.Timing.traceWindowFromMicroSeconds(event.args.data.syntheticData.downloadStart, (event.args.data.syntheticData.downloadStart + event.args.data.syntheticData.download));
        sections.push({ bounds, label: i18nString(UIStrings.uncompressedDownload), showDuration: true });
        overlays.push({ type: 'CANDY_STRIPED_TIME_RANGE', bounds, entry: event });
    }
    if (sections.length) {
        overlays.push({
            type: 'TIMESPAN_BREAKDOWN',
            sections,
            entry: model.data.documentRequest,
            // Always render below because the document request is guaranteed to be
            // the first request in the network track.
            renderLocation: 'BELOW_EVENT',
        });
    }
    overlays.push({
        type: 'ENTRY_SELECTED',
        entry: model.data.documentRequest,
    });
    return overlays;
}
//# sourceMappingURL=DocumentLatency.js.map