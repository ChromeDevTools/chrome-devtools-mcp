// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
import * as Platform from '../../../core/platform/platform.js';
// Cache film strips based on:
// 1. The trace parsed data object
// 2. The start time.
const filmStripCache = new WeakMap();
export function fromHandlerData(data, customZeroTime) {
    const frames = [];
    const zeroTime = typeof customZeroTime !== 'undefined' ? customZeroTime : data.Meta.traceBounds.min;
    const spanTime = data.Meta.traceBounds.range;
    const fromCache = filmStripCache.get(data)?.get(zeroTime);
    if (fromCache) {
        return fromCache;
    }
    const screenshots = data.Screenshots.screenshots ?? data.Screenshots.legacySyntheticScreenshots ?? [];
    for (const screenshotEvent of screenshots) {
        if (screenshotEvent.ts < zeroTime) {
            continue;
        }
        const frame = {
            index: frames.length,
            screenshotEvent,
        };
        frames.push(frame);
    }
    const result = {
        zeroTime,
        spanTime,
        frames: Array.from(frames),
    };
    const cachedForData = Platform.MapUtilities.getWithDefault(filmStripCache, data, () => new Map());
    cachedForData.set(zeroTime, result);
    return result;
}
export function frameClosestToTimestamp(filmStrip, searchTimestamp) {
    const closestFrameIndexBeforeTimestamp = Platform.ArrayUtilities.nearestIndexFromEnd(filmStrip.frames, frame => frame.screenshotEvent.ts < searchTimestamp);
    if (closestFrameIndexBeforeTimestamp === null) {
        return null;
    }
    return filmStrip.frames[closestFrameIndexBeforeTimestamp];
}
//# sourceMappingURL=FilmStrip.js.map