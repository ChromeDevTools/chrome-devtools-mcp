// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as WebVitals from '../../../third_party/web-vitals/web-vitals.js';
import * as OnEachLayoutShift from './OnEachLayoutShift.js';
import * as Spec from './spec/spec.js';
const { onLCP, onCLS, onINP } = WebVitals.Attribution;
const { onEachLayoutShift } = OnEachLayoutShift;
const eventListenerCleanupController = new AbortController();
const patchAddListener = (proto) => {
    const original = proto.addEventListener;
    proto.addEventListener = function (type, listener, options) {
        // Standardize options into an object
        const navOptions = typeof options === 'boolean' ? { capture: options } : { ...options };
        // If we already have a signal, we should respect it,
        // but also link it to our global cleanup signal.
        if (navOptions.signal) {
            navOptions.signal = AbortSignal.any([navOptions.signal, eventListenerCleanupController.signal]);
        }
        else {
            navOptions.signal = eventListenerCleanupController.signal;
        }
        return original.call(this, type, listener, navOptions);
    };
};
// Patch the core targets
patchAddListener(Window.prototype);
patchAddListener(Document.prototype);
// Use a class wrapper that auto-registers and auto-unregisters
const activeObservers = new Set();
class TrackedPerformanceObserver extends globalThis.PerformanceObserver {
    constructor(callback) {
        super(callback);
        activeObservers.add(this);
    }
    // Override disconnect to remove it from our tracking set
    disconnect() {
        super.disconnect();
        activeObservers.delete(this);
    }
}
const nodeList = [];
const nodeToIdMap = new WeakMap();
function establishNodeIndex(node) {
    let index = nodeToIdMap.get(node);
    if (index !== undefined) {
        return index;
    }
    index = nodeList.length;
    nodeList.push(new WeakRef(node));
    nodeToIdMap.set(node, index);
    return index;
}
// Replace the global constructor
globalThis.PerformanceObserver = TrackedPerformanceObserver;
/**
 * This is a hack solution to remove any listeners that were added by web-vitals.js
 * or additional services in this bundle. Once this function is called, the execution
 * context should be considered dead and a new one will need to be created for live metrics
 * to be served again.
 */
let killed = false;
window[Spec.INTERNAL_KILL_SWITCH] = () => {
    if (killed) {
        return;
    }
    for (const observer of activeObservers) {
        // This calls the overridden disconnect above,
        // cleaning up BOTH the browser resource and our Set.
        observer.disconnect();
    }
    activeObservers.clear();
    eventListenerCleanupController.abort();
    // Explicitly clear the Node List to help GC
    nodeList.length = 0;
    killed = true;
};
function sendEventToDevTools(event) {
    const payload = JSON.stringify(event);
    window[Spec.EVENT_BINDING_NAME]?.(payload);
}
/**
 * The data sent over the event binding needs to be JSON serializable, so we
 * can't send DOM nodes directly. Instead we create an ID for each node (see
 * `establishNodeIndex`) that we can later use to retrieve a remote object
 * for that node.
 *
 * This function is used by `Runtime.evaluate` calls to get a remote object
 * for the specified index.
 */
window.getNodeForIndex = (index) => {
    return nodeList[index].deref();
};
function isPrerendered() {
    if (document.prerendering) {
        return true;
    }
    const firstNavStart = self.performance.getEntriesByType?.('navigation')[0]?.activationStart;
    return firstNavStart !== undefined && firstNavStart > 0;
}
let startedHidden = null;
function initialize() {
    sendEventToDevTools({ name: 'reset' });
    new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
            if (startedHidden === null && !isPrerendered()) {
                startedHidden = entry.name === 'hidden';
            }
        }
    }).observe({ type: 'visibility-state', buffered: true });
    // We want to treat bfcache navigations like a standard navigations, so emit
    // a reset event when bfcache is restored.
    //
    // Metric functions will also re-emit their values using this listener's callback.
    // To ensure this event is fired before those values are emitted, register this
    // callback before any others.
    WebVitals.onBFCacheRestore(() => {
        startedHidden = false;
        sendEventToDevTools({ name: 'reset', navigationType: 'back-forward-cache' });
    });
    let lastLcpNavigationId;
    onLCP(metric => {
        if (lastLcpNavigationId && metric.navigationId && metric.navigationId !== lastLcpNavigationId) {
            sendEventToDevTools({ name: 'reset', url: window.location.href, navigationType: metric.navigationType });
        }
        lastLcpNavigationId = metric.navigationId;
        const event = {
            name: 'LCP',
            value: metric.value,
            startedHidden: Boolean(startedHidden),
            subparts: {
                timeToFirstByte: metric.attribution.timeToFirstByte,
                resourceLoadDelay: metric.attribution.resourceLoadDelay,
                resourceLoadTime: metric.attribution.resourceLoadDuration,
                elementRenderDelay: metric.attribution.elementRenderDelay,
            },
        };
        const element = metric.attribution.lcpEntry?.element;
        if (element) {
            event.nodeIndex = establishNodeIndex(element);
        }
        sendEventToDevTools(event);
    }, { reportAllChanges: true, reportSoftNavs: window.devToolsReportSoftNavs });
    onCLS(metric => {
        const event = {
            name: 'CLS',
            value: metric.value,
            clusterShiftIds: metric.entries.map(Spec.getUniqueLayoutShiftId),
        };
        sendEventToDevTools(event);
    }, { reportAllChanges: true, reportSoftNavs: window.devToolsReportSoftNavs });
    function onEachInteraction(interaction) {
        sendEventToDevTools(Spec.createInteractionEntryEvent(interaction));
    }
    onINP(metric => {
        sendEventToDevTools(Spec.createInpChangeEvent(metric));
    }, {
        reportAllChanges: true,
        durationThreshold: 0,
        includeProcessedEventEntries: false,
        reportSoftNavs: window.devToolsReportSoftNavs,
        onEachInteraction,
        generateTarget(el) {
            if (el) {
                return String(establishNodeIndex(el));
            }
            return undefined;
        },
    });
    onEachLayoutShift(layoutShift => {
        const event = {
            name: 'LayoutShift',
            score: layoutShift.value,
            uniqueLayoutShiftId: Spec.getUniqueLayoutShiftId(layoutShift.entry),
            affectedNodeIndices: layoutShift.attribution.affectedNodes.map(establishNodeIndex),
        };
        sendEventToDevTools(event);
    });
}
initialize();
//# sourceMappingURL=web-vitals-injected.js.map