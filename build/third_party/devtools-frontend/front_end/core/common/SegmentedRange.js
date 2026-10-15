// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../platform/platform.js';
export class Segment {
    begin;
    end;
    data;
    constructor(begin, end, data) {
        if (begin > end) {
            throw new Error('Invalid segment');
        }
        this.begin = begin;
        this.end = end;
        this.data = data;
    }
    intersects(that) {
        return this.begin < that.end && that.begin < this.end;
    }
}
export class SegmentedRange {
    #segments = [];
    #mergeCallback;
    constructor(mergeCallback) {
        this.#mergeCallback = mergeCallback;
    }
    append(newSegment) {
        // 1. Find the proper insertion point for new segment
        let startIndex = Platform.ArrayUtilities.lowerBound(this.#segments, newSegment, (a, b) => a.begin - b.begin);
        let endIndex = startIndex;
        let merged = null;
        if (startIndex > 0) {
            // 2. Try mering the preceding segment
            const precedingSegment = this.#segments[startIndex - 1];
            merged = this.tryMerge(precedingSegment, newSegment);
            if (merged) {
                --startIndex;
                newSegment = merged;
            }
            else if (this.#segments[startIndex - 1].end >= newSegment.begin) {
                // 2a. If merge failed and segments overlap, adjust preceding segment.
                // If an old segment entirely contains new one, split it in two.
                if (newSegment.end < precedingSegment.end) {
                    this.#segments.splice(startIndex, 0, new Segment(newSegment.end, precedingSegment.end, precedingSegment.data));
                }
                precedingSegment.end = newSegment.begin;
            }
        }
        // 3. Consume all segments that are entirely covered by the new one.
        while (endIndex < this.#segments.length && this.#segments[endIndex].end <= newSegment.end) {
            ++endIndex;
        }
        // 4. Merge or adjust the succeeding segment if it overlaps.
        if (endIndex < this.#segments.length) {
            merged = this.tryMerge(newSegment, this.#segments[endIndex]);
            if (merged) {
                endIndex++;
                newSegment = merged;
            }
            else if (newSegment.intersects(this.#segments[endIndex])) {
                this.#segments[endIndex].begin = newSegment.end;
            }
        }
        this.#segments.splice(startIndex, endIndex - startIndex, newSegment);
    }
    segments() {
        return this.#segments;
    }
    tryMerge(first, second) {
        const merged = this.#mergeCallback && this.#mergeCallback(first, second);
        if (!merged) {
            return null;
        }
        merged.begin = first.begin;
        merged.end = Math.max(first.end, second.end);
        return merged;
    }
}
//# sourceMappingURL=SegmentedRange.js.map