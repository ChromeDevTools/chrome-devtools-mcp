// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
const UIStrings = {
    /**
     * @description Latency download total format in Network Time Calculator of the Network panel.
     * @example {20ms} PH1
     * @example {20ms} PH2
     * @example {40ms} PH3
     */
    sLatencySDownloadSTotal: '{PH1} latency, {PH2} download ({PH3} total)',
    /**
     * @description Latency format in Network Time Calculator of the Network panel.
     * @example {20ms} PH1
     */
    sLatency: '{PH1} latency',
    /**
     * @description Duration of the download in ms/s shown for a completed network request.
     * @example {5ms} PH1
     */
    sDownload: '{PH1} download',
    /**
     * @description From service worker format in Network Time Calculator of the Network panel.
     * @example {20ms latency} PH1
     */
    sFromServiceworker: '{PH1} (from `ServiceWorker`)',
    /**
     * @description From cache format in Network Time Calculator of the Network panel.
     * @example {20ms latency} PH1
     */
    sFromCache: '{PH1} (from cache)',
};
const str_ = i18n.i18n.registerUIStrings('models/network_time_calculator/NetworkTimeCalculator.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class NetworkTimeBoundary {
    minimum;
    maximum;
    constructor(minimum, maximum) {
        this.minimum = minimum;
        this.maximum = maximum;
    }
    equals(other) {
        return (this.minimum === other.minimum) && (this.maximum === other.maximum);
    }
}
export class NetworkTimeCalculator extends Common.ObjectWrapper.ObjectWrapper {
    #minimumBoundary = -1;
    #maximumBoundary = -1;
    #boundaryChangedEventThrottler = new Common.Throttler.Throttler(0);
    #window = null;
    #workingArea;
    startAtZero;
    constructor(startAtZero) {
        super();
        this.startAtZero = startAtZero;
    }
    setWindow(window) {
        this.#window = window;
        this.boundaryChanged();
    }
    computePosition(time) {
        return (time - this.minimumBoundary()) / this.boundarySpan() * (this.#workingArea || 0);
    }
    formatValue(value, precision) {
        return i18n.TimeUtilities.secondsToString(value, Boolean(precision));
    }
    minimumBoundary() {
        return this.#window ? this.#window.minimum : this.#minimumBoundary;
    }
    zeroTime() {
        return this.#minimumBoundary;
    }
    maximumBoundary() {
        return this.#window ? this.#window.maximum : this.#maximumBoundary;
    }
    boundary() {
        return new NetworkTimeBoundary(this.minimumBoundary(), this.maximumBoundary());
    }
    boundarySpan() {
        return this.maximumBoundary() - this.minimumBoundary();
    }
    reset() {
        this.#minimumBoundary = -1;
        this.#maximumBoundary = -1;
        this.boundaryChanged();
    }
    value() {
        return 0;
    }
    setDisplayWidth(clientWidth) {
        this.#workingArea = clientWidth;
    }
    computeBarGraphPercentages(request) {
        let start;
        let middle;
        let end;
        if (request.startTime !== -1) {
            start = ((request.startTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
        }
        else {
            start = 0;
        }
        if (request.responseReceivedTime !== -1) {
            middle = ((request.responseReceivedTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
        }
        else {
            middle = (this.startAtZero ? start : 100);
        }
        if (request.endTime !== -1) {
            end = ((request.endTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
        }
        else {
            end = (this.startAtZero ? middle : 100);
        }
        if (this.startAtZero) {
            end -= start;
            middle -= start;
            start = 0;
        }
        return { start, middle, end };
    }
    boundaryChanged() {
        void this.#boundaryChangedEventThrottler.schedule(async () => {
            this.dispatchEventToListeners("BoundariesChanged" /* Events.BOUNDARIES_CHANGED */);
        });
    }
    updateBoundariesForEventTime(eventTime) {
        if (eventTime === -1 || this.startAtZero) {
            return;
        }
        if (this.#maximumBoundary === undefined || eventTime > this.#maximumBoundary) {
            this.#maximumBoundary = eventTime;
            this.boundaryChanged();
        }
    }
    computeBarGraphLabels(request) {
        let rightLabel = '';
        if (request.responseReceivedTime !== -1 && request.endTime !== -1) {
            rightLabel = i18n.TimeUtilities.secondsToString(request.endTime - request.responseReceivedTime);
        }
        const hasLatency = request.latency > 0;
        const leftLabel = hasLatency ? i18n.TimeUtilities.secondsToString(request.latency) : rightLabel;
        if (request.timing) {
            return {
                left: leftLabel,
                right: rightLabel,
            };
        }
        let tooltip;
        if (hasLatency && rightLabel) {
            const total = i18n.TimeUtilities.secondsToString(request.duration);
            tooltip = i18nString(UIStrings.sLatencySDownloadSTotal, { PH1: leftLabel, PH2: rightLabel, PH3: total });
        }
        else if (hasLatency) {
            tooltip = i18nString(UIStrings.sLatency, { PH1: leftLabel });
        }
        else if (rightLabel) {
            tooltip = i18nString(UIStrings.sDownload, { PH1: rightLabel });
        }
        if (request.fetchedViaServiceWorker) {
            tooltip = i18nString(UIStrings.sFromServiceworker, { PH1: String(tooltip) });
        }
        else if (request.cached()) {
            tooltip = i18nString(UIStrings.sFromCache, { PH1: String(tooltip) });
        }
        return { left: leftLabel, right: rightLabel, tooltip };
    }
    updateBoundaries(request) {
        const lowerBound = this.lowerBound(request);
        const upperBound = this.upperBound(request);
        let changed = false;
        if (lowerBound !== -1 || this.startAtZero) {
            changed = this.extendBoundariesToIncludeTimestamp(this.startAtZero ? 0 : lowerBound);
        }
        if (upperBound !== -1) {
            changed = this.extendBoundariesToIncludeTimestamp(upperBound) || changed;
        }
        if (changed) {
            this.boundaryChanged();
        }
    }
    extendBoundariesToIncludeTimestamp(timestamp) {
        const previousMinimumBoundary = this.#minimumBoundary;
        const previousMaximumBoundary = this.#maximumBoundary;
        const minOffset = MINIMUM_SPREAD;
        if (this.#minimumBoundary === -1 || this.#maximumBoundary === -1) {
            this.#minimumBoundary = timestamp;
            this.#maximumBoundary = timestamp + minOffset;
        }
        else {
            this.#minimumBoundary = Math.min(timestamp, this.#minimumBoundary);
            this.#maximumBoundary = Math.max(timestamp, this.#minimumBoundary + minOffset, this.#maximumBoundary);
        }
        return previousMinimumBoundary !== this.#minimumBoundary || previousMaximumBoundary !== this.#maximumBoundary;
    }
    lowerBound(_request) {
        return 0;
    }
    upperBound(_request) {
        return 0;
    }
}
const MINIMUM_SPREAD = 0.1;
export class NetworkTransferTimeCalculator extends NetworkTimeCalculator {
    constructor() {
        super(false);
    }
    formatValue(value, precision) {
        return i18n.TimeUtilities.secondsToString(value - this.zeroTime(), Boolean(precision));
    }
    lowerBound(request) {
        return request.issueTime();
    }
    upperBound(request) {
        return request.endTime;
    }
}
export class NetworkTransferDurationCalculator extends NetworkTimeCalculator {
    constructor() {
        super(true);
    }
    formatValue(value, precision) {
        return i18n.TimeUtilities.secondsToString(value, Boolean(precision));
    }
    upperBound(request) {
        return request.duration;
    }
}
//# sourceMappingURL=NetworkTimeCalculator.js.map