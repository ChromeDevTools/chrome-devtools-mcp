// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as metaHandlerData } from './MetaHandler.js';
let paintEvents = [];
let snapshotEvents = [];
let paintToSnapshotMap = new WeakMap();
let lastPaintForLayerId = {};
let currentMainFrameLayerTreeId = null;
let updateLayerEvents = [];
let relevantEvents = [];
export function reset() {
    paintEvents = [];
    snapshotEvents = [];
    paintToSnapshotMap = new WeakMap();
    lastPaintForLayerId = {};
    currentMainFrameLayerTreeId = null;
    updateLayerEvents = [];
    relevantEvents = [];
}
export function handleEvent(event) {
    // We gather up the events here but do all the processing in finalize(). This
    // is because we need to have all the events before we process them, and we
    // need the Meta handler to be finalized() so we can use its data as we need
    // the mainFrameId to know which Layer(s) to care about.
    if (Types.Events.isPaint(event) || Types.Events.isDisplayListItemListSnapshot(event) ||
        Types.Events.isUpdateLayer(event) || Types.Events.isSetLayerId(event)) {
        relevantEvents.push(event);
    }
}
export async function finalize() {
    const metaData = metaHandlerData();
    Helpers.Trace.sortTraceEventsInPlace(relevantEvents);
    for (const event of relevantEvents) {
        if (Types.Events.isSetLayerId(event)) {
            if (metaData.mainFrameId !== event.args.data.frame) {
                // We only care about LayerId changes that affect the main frame.
                continue;
            }
            currentMainFrameLayerTreeId = event.args.data.layerTreeId;
        }
        else if (Types.Events.isUpdateLayer(event)) {
            // We don't do anything with this event, but we need to store it because
            // the information in it determines if we need to care about future
            // snapshot events - we need to know what the active layer is when we see a
            // snapshot.
            updateLayerEvents.push(event);
        }
        else if (Types.Events.isPaint(event)) {
            if (!event.args.data.layerId) {
                // A layerId of 0 means that this event cannot be associated with a
                // compositor layer. This includes modern Paint duration events and
                // older Paint events for subframes.
                continue;
            }
            paintEvents.push(event);
            lastPaintForLayerId[event.args.data.layerId] = event;
            continue;
        }
        else if (Types.Events.isDisplayListItemListSnapshot(event)) {
            // First we figure out which layer is active for this event's thread. To
            // do this we work backwards through the list of UpdateLayerEvents,
            // finding the first one (i.e. the most recent one) with the same pid and
            // tid.
            let lastUpdateLayerEventForThread = null;
            for (let i = updateLayerEvents.length - 1; i > -1; i--) {
                const updateEvent = updateLayerEvents[i];
                if (updateEvent.pid === event.pid && updateEvent.tid === event.tid) {
                    lastUpdateLayerEventForThread = updateEvent;
                    break;
                }
            }
            if (!lastUpdateLayerEventForThread) {
                // No active layer, so this snapshot is not relevant.
                continue;
            }
            if (lastUpdateLayerEventForThread.args.layerTreeId !== currentMainFrameLayerTreeId) {
                // Snapshot applies to a layer that is not the main frame, so discard.
                continue;
            }
            const paintEvent = lastPaintForLayerId[lastUpdateLayerEventForThread.args.layerId];
            if (!paintEvent) {
                // No paint event for this layer, so discard.
                continue;
            }
            snapshotEvents.push(event);
            // Store the relationship between the paint and the snapshot.
            paintToSnapshotMap.set(paintEvent, event);
        }
    }
}
export function data() {
    return {
        paints: paintEvents,
        snapshots: snapshotEvents,
        paintsToSnapshots: paintToSnapshotMap,
    };
}
export function deps() {
    return ['Meta'];
}
//# sourceMappingURL=LayerTreeHandler.js.map