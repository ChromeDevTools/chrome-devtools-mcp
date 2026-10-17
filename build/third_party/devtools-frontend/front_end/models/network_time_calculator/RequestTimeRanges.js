// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const ServiceWorkerRangeNames = new Set([
    "serviceworker" /* RequestTimeRangeNames.SERVICE_WORKER */,
    "serviceworker-preparation" /* RequestTimeRangeNames.SERVICE_WORKER_PREPARATION */,
    "serviceworker-respondwith" /* RequestTimeRangeNames.SERVICE_WORKER_RESPOND_WITH */,
    "serviceworker-routerevaluation" /* RequestTimeRangeNames.SERVICE_WORKER_ROUTER_EVALUATION */,
    "serviceworker-cachelookup" /* RequestTimeRangeNames.SERVICE_WORKER_CACHE_LOOKUP */,
]);
export const ConnectionSetupRangeNames = new Set([
    "queueing" /* RequestTimeRangeNames.QUEUEING */,
    "blocking" /* RequestTimeRangeNames.BLOCKING */,
    "connecting" /* RequestTimeRangeNames.CONNECTING */,
    "dns" /* RequestTimeRangeNames.DNS */,
    "proxy" /* RequestTimeRangeNames.PROXY */,
    "ssl" /* RequestTimeRangeNames.SSL */,
]);
export function calculateRequestTimeRanges(request, navigationStart) {
    const result = [];
    function addRange(name, start, end) {
        if (start < Number.MAX_VALUE && start <= end) {
            result.push({ name, start, end });
        }
    }
    function firstPositive(numbers) {
        for (let i = 0; i < numbers.length; ++i) {
            if (numbers[i] > 0) {
                return numbers[i];
            }
        }
        return undefined;
    }
    function addOffsetRange(name, start, end) {
        if (start >= 0 && end >= 0) {
            addRange(name, startTime + (start / 1000), startTime + (end / 1000));
        }
    }
    /**
     * In some situations, argument `start` may come before `startTime` (`timing.requestStart`). This is especially true
     * in cases such as SW static routing API where fields like `workerRouterEvaluationStart` or `workerCacheLookupStart`
     * is set before setting `timing.requestStart`. If the `start` and `end` is known to be a valid value (i.e. not default
     * invalid value -1 or undefined), we allow adding the range.
     **/
    function addMaybeNegativeOffsetRange(name, start, end) {
        addRange(name, startTime + (start / 1000), startTime + (end / 1000));
    }
    const timing = request.timing;
    if (!timing) {
        const start = request.issueTime() !== -1 ? request.issueTime() : request.startTime !== -1 ? request.startTime : 0;
        const hasDifferentIssueAndStartTime = request.issueTime() !== -1 && request.startTime !== -1 && request.issueTime() !== request.startTime;
        const middle = (request.responseReceivedTime === -1) ?
            (hasDifferentIssueAndStartTime ? request.startTime : Number.MAX_VALUE) :
            request.responseReceivedTime;
        const end = (request.endTime === -1) ? Number.MAX_VALUE : request.endTime;
        addRange("total" /* RequestTimeRangeNames.TOTAL */, start, end);
        addRange("blocking" /* RequestTimeRangeNames.BLOCKING */, start, middle);
        const state = request.responseReceivedTime === -1 ? "connecting" /* RequestTimeRangeNames.CONNECTING */ : "receiving" /* RequestTimeRangeNames.RECEIVING */;
        addRange(state, middle, end);
        return result;
    }
    const issueTime = request.issueTime();
    const startTime = timing.requestTime;
    const endTime = firstPositive([request.endTime, request.responseReceivedTime]) || startTime;
    addRange("total" /* RequestTimeRangeNames.TOTAL */, issueTime < startTime ? issueTime : startTime, endTime);
    if (timing.pushStart) {
        const pushEnd = timing.pushEnd || endTime;
        // Only show the part of push that happened after the navigation/reload.
        // Pushes that happened on the same connection before we started main request will not be shown.
        if (pushEnd > navigationStart) {
            addRange("push" /* RequestTimeRangeNames.PUSH */, Math.max(timing.pushStart, navigationStart), pushEnd);
        }
    }
    if (issueTime < startTime) {
        addRange("queueing" /* RequestTimeRangeNames.QUEUEING */, issueTime, startTime);
    }
    const responseReceived = (request.responseReceivedTime - startTime) * 1000;
    if (request.fetchedViaServiceWorker) {
        addOffsetRange("blocking" /* RequestTimeRangeNames.BLOCKING */, 0, timing.workerStart);
        addOffsetRange("serviceworker-preparation" /* RequestTimeRangeNames.SERVICE_WORKER_PREPARATION */, timing.workerStart, timing.workerReady);
        addOffsetRange("serviceworker-respondwith" /* RequestTimeRangeNames.SERVICE_WORKER_RESPOND_WITH */, timing.workerFetchStart, timing.workerRespondWithSettled);
        addOffsetRange("serviceworker" /* RequestTimeRangeNames.SERVICE_WORKER */, timing.workerReady, timing.sendEnd);
        addOffsetRange("waiting" /* RequestTimeRangeNames.WAITING */, timing.sendEnd, responseReceived);
    }
    else if (!timing.pushStart) {
        const blockingEnd = firstPositive([timing.dnsStart, timing.connectStart, timing.sendStart, responseReceived]) || 0;
        addOffsetRange("blocking" /* RequestTimeRangeNames.BLOCKING */, 0, blockingEnd);
        addOffsetRange("proxy" /* RequestTimeRangeNames.PROXY */, timing.proxyStart, timing.proxyEnd);
        addOffsetRange("dns" /* RequestTimeRangeNames.DNS */, timing.dnsStart, timing.dnsEnd);
        addOffsetRange("connecting" /* RequestTimeRangeNames.CONNECTING */, timing.connectStart, timing.connectEnd);
        addOffsetRange("ssl" /* RequestTimeRangeNames.SSL */, timing.sslStart, timing.sslEnd);
        addOffsetRange("sending" /* RequestTimeRangeNames.SENDING */, timing.sendStart, timing.sendEnd);
        addOffsetRange("waiting" /* RequestTimeRangeNames.WAITING */, Math.max(timing.sendEnd, timing.connectEnd, timing.dnsEnd, timing.proxyEnd, blockingEnd), responseReceived);
    }
    const { serviceWorkerRouterInfo } = request;
    if (serviceWorkerRouterInfo) {
        if (timing.workerRouterEvaluationStart) {
            // Depending on the source,the next timestamp will be different. Determine the timestamp by checking
            // the matched and actual source.
            let routerEvaluationEnd = timing.sendStart;
            if (serviceWorkerRouterInfo?.matchedSourceType === "cache" /* Protocol.Network.ServiceWorkerRouterSource.Cache */ &&
                timing.workerCacheLookupStart) {
                routerEvaluationEnd = timing.workerCacheLookupStart;
            }
            else if (serviceWorkerRouterInfo?.actualSourceType === "fetch-event" /* Protocol.Network.ServiceWorkerRouterSource.FetchEvent */) {
                routerEvaluationEnd = timing.workerStart;
            }
            addMaybeNegativeOffsetRange("serviceworker-routerevaluation" /* RequestTimeRangeNames.SERVICE_WORKER_ROUTER_EVALUATION */, timing.workerRouterEvaluationStart, routerEvaluationEnd);
        }
        if (timing.workerCacheLookupStart) {
            let cacheLookupEnd = timing.sendStart;
            if (serviceWorkerRouterInfo?.actualSourceType === "cache" /* Protocol.Network.ServiceWorkerRouterSource.Cache */) {
                cacheLookupEnd = timing.receiveHeadersStart;
            }
            addMaybeNegativeOffsetRange("serviceworker-cachelookup" /* RequestTimeRangeNames.SERVICE_WORKER_CACHE_LOOKUP */, timing.workerCacheLookupStart, cacheLookupEnd);
        }
    }
    if (request.endTime !== -1) {
        addRange(timing.pushStart ? "receiving-push" /* RequestTimeRangeNames.RECEIVING_PUSH */ : "receiving" /* RequestTimeRangeNames.RECEIVING */, request.responseReceivedTime, endTime);
    }
    return result;
}
//# sourceMappingURL=RequestTimeRanges.js.map