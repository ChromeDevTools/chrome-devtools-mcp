// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Types from '../types/types.js';
import { data as metaHandlerData } from './MetaHandler.js';
/**
 * This handler is responsible for the relationships between:
 * DecodeImage/ResizeImage, PaintImage and DrawLazyPixelRef events.
 *
 * When we get a DecodeImage event, we want to associate it to a PaintImage
 * event, primarily so we can determine the NodeID of the image that was
 * decoded.
 * We can do this in two ways:
 *
 * 1. If there is a PaintImage event on the same thread, use that
 *    (if there are multiple, use the latest one).
 *
 * 2. If not, we can find the DecodeLazyPixelRef event on the same thread, and
 *    use the PaintImage event associated with it via the `LazyPixelRef` key.
 */
// Track paintImageEvents across threads.
let paintImageEvents = new Map();
let decodeLazyPixelRefEvents = new Map();
// A DrawLazyPixelRef event will contain a numerical reference in
// args.LazyPixelRef. As we parse each DrawLazyPixelRef, we can assign it to a
// paint event. Later we want to look up paint events by this reference, so we
// store them in this map.
let paintImageByLazyPixelRef = new Map();
// When we find events that we want to tie to a particular PaintImage event, we add them to this map.
// These are currently only DecodeImage and ResizeImage events, but the type is
// deliberately generic as in the future we might want to add more events that
// have a relationship to a individual PaintImage event.
let eventToPaintImage = new WeakMap();
let urlToPaintImage = new Map();
let paintEventToCorrectedDisplaySize = new WeakMap();
let didCorrectForHostDpr = false;
export function reset() {
    paintImageEvents = new Map();
    decodeLazyPixelRefEvents = new Map();
    paintImageByLazyPixelRef = new Map();
    eventToPaintImage = new WeakMap();
    urlToPaintImage = new Map();
    paintEventToCorrectedDisplaySize = new WeakMap();
    didCorrectForHostDpr = false;
}
export function handleEvent(event) {
    if (Types.Events.isPaintImage(event)) {
        const forProcess = paintImageEvents.get(event.pid) || new Map();
        const forThread = forProcess.get(event.tid) || [];
        forThread.push(event);
        forProcess.set(event.tid, forThread);
        paintImageEvents.set(event.pid, forProcess);
        if (event.args.data.url) {
            const paintsForUrl = Platform.MapUtilities.getWithDefault(urlToPaintImage, event.args.data.url, () => []);
            paintsForUrl.push(event);
        }
        return;
    }
    if (Types.Events.isDecodeLazyPixelRef(event) && typeof event.args?.LazyPixelRef !== 'undefined') {
        // Store these because we use them to tie DecodeImage to a PaintEvent.
        const forProcess = decodeLazyPixelRefEvents.get(event.pid) || new Map();
        const forThread = forProcess.get(event.tid) || [];
        forThread.push(event);
        forProcess.set(event.tid, forThread);
        decodeLazyPixelRefEvents.set(event.pid, forProcess);
    }
    // If we see a DrawLazyPixelRef event, we need to find the last PaintImage
    // event on the thread and associate it to the LazyPixelRef that is supplied
    // in the DrawLazyPixelRef event.
    // This means that later on if we see a DecodeLazyPixelRef event with the
    // same LazyPixelRef key, we can find its associated PaintImage event by
    // looking it up.
    if (Types.Events.isDrawLazyPixelRef(event) && typeof event.args?.LazyPixelRef !== 'undefined') {
        const lastPaintEvent = paintImageEvents.get(event.pid)?.get(event.tid)?.at(-1);
        if (!lastPaintEvent) {
            return;
        }
        paintImageByLazyPixelRef.set(event.args.LazyPixelRef, lastPaintEvent);
        return;
    }
    if (Types.Events.isDecodeImage(event)) {
        // When we see a DecodeImage, we want to associate it to a PaintImage
        // event. We try two approaches:
        //
        // 1. If the thread of the DecodeImage event has a previous PaintImage
        // event, that is the associated event.
        //
        // 2. If that is false, we then look on the thread for a DecodeLazyPixelRef
        // event. If we find that, we then look for its associated PaintImage
        // event, which we associate via DrawLazyPixelRef events (the code block
        // above this one)
        //
        // 1. Find a PaintImage event on the same thread. If we find it, that's our association done.
        const lastPaintImageEventOnThread = paintImageEvents.get(event.pid)?.get(event.tid)?.at(-1);
        if (lastPaintImageEventOnThread) {
            eventToPaintImage.set(event, lastPaintImageEventOnThread);
            return;
        }
        // 2. Find the last DecodeLazyPixelRef event and, if we find it, find its associated PaintImage event.
        const lastDecodeLazyPixelRef = decodeLazyPixelRefEvents.get(event.pid)?.get(event.tid)?.at(-1);
        if (typeof lastDecodeLazyPixelRef?.args?.LazyPixelRef === 'undefined') {
            return;
        }
        const paintEvent = paintImageByLazyPixelRef.get(lastDecodeLazyPixelRef.args.LazyPixelRef);
        if (!paintEvent) {
            return;
        }
        eventToPaintImage.set(event, paintEvent);
    }
}
export async function finalize(options) {
    // Painting in Chrome never uses the emulated DPR, but instead used the host's DPR.
    // We need to correct for that for our responsive image checks in the ImageDelivery
    // insight.
    // See: crbug.com/427552461 crbug.com/416580500#comment5
    if (!options.metadata?.hostDPR) {
        return;
    }
    // Note: this isn't necessarily emulated (for desktop+no DPR emulation, it's equal
    // to host DPR).
    const { devicePixelRatio: emulatedDpr } = metaHandlerData();
    if (!emulatedDpr) {
        return;
    }
    for (const byThread of paintImageEvents.values()) {
        for (const paintEvents of byThread.values()) {
            for (const paintEvent of paintEvents) {
                const cssPixelsWidth = paintEvent.args.data.width / options.metadata.hostDPR;
                const cssPixelsHeight = paintEvent.args.data.height / options.metadata.hostDPR;
                const width = cssPixelsWidth * emulatedDpr;
                const height = cssPixelsHeight * emulatedDpr;
                paintEventToCorrectedDisplaySize.set(paintEvent, { width, height });
            }
        }
    }
    didCorrectForHostDpr = true;
}
export function data() {
    return {
        paintImageByDrawLazyPixelRef: paintImageByLazyPixelRef,
        paintImageForEvent: eventToPaintImage,
        paintImageEventForUrl: urlToPaintImage,
        paintEventToCorrectedDisplaySize,
        didCorrectForHostDpr,
    };
}
//# sourceMappingURL=ImagePaintingHandler.js.map