// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Handlers from '../handlers/handlers.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import * as TraceFilter from './TraceFilter.js';
import * as TraceTree from './TraceTree.js';
/**
 *
 * Returns Main frame main thread events.
 * These events are inline with the ones used by selectedEvents() of TimelineTreeViews
 */
function collectMainThreadActivity(data) {
    // TODO: Note b/402658800 could be an issue here.
    const mainFrameMainThread = data.Renderer.processes.values()
        .find(p => {
        const url = p.url ?? '';
        // Frame url checked a la CompatibilityTracksAppenders's addThreadAppenders
        return p.isOnMainFrame && !url.startsWith('about:') && !url.startsWith('chrome:');
    })
        ?.threads.values()
        .find(t => t.name === 'CrRendererMain');
    if (!mainFrameMainThread) {
        return [];
    }
    return mainFrameMainThread.entries;
}
export function summarizeByThirdParty(data, traceBounds) {
    const mainThreadEvents = collectMainThreadActivity(data);
    const groupingFunction = (event) => {
        const entity = data.Renderer.entityMappings.entityByEvent.get(event);
        return entity?.name ?? '';
    };
    const node = getBottomUpTree(mainThreadEvents, traceBounds, groupingFunction);
    const summaries = summarizeBottomUpByEntity(node, data);
    return summaries;
}
/**
 * Used only by Lighthouse.
 */
export function summarizeByURL(data, traceBounds) {
    const mainThreadEvents = collectMainThreadActivity(data);
    const groupingFunction = (event) => {
        return Handlers.Helpers.getNonResolvedURL(event, data) ?? '';
    };
    const node = getBottomUpTree(mainThreadEvents, traceBounds, groupingFunction);
    const summaries = summarizeBottomUpByURL(node, data);
    return summaries;
}
function summarizeBottomUpByEntity(root, data) {
    const summaries = [];
    // Top nodes are the 3P entities.
    const topNodes = [...root.children().values()].flat();
    for (const node of topNodes) {
        if (node.id === '') {
            continue;
        }
        const entity = data.Renderer.entityMappings.entityByEvent.get(node.event);
        if (!entity) {
            continue;
        }
        // Lets use the mapper events as our source of events, since we use the main thread to construct
        // the bottom up tree. The mapper will give us all related events.
        const summary = {
            transferSize: node.transferSize,
            mainThreadTime: Types.Timing.Milli(node.selfTime),
            entity,
            relatedEvents: data.Renderer.entityMappings.eventsByEntity.get(entity) ?? [],
        };
        summaries.push(summary);
    }
    return summaries;
}
function summarizeBottomUpByURL(root, data) {
    const summaries = [];
    const allRequests = data.NetworkRequests.byTime;
    // Top nodes are URLs.
    const topNodes = [...root.children().values()].flat();
    for (const node of topNodes) {
        if (node.id === '' || typeof node.id !== 'string') {
            continue;
        }
        const entity = data.Renderer.entityMappings.entityByEvent.get(node.event);
        if (!entity) {
            continue;
        }
        const url = node.id;
        const request = allRequests.find(r => r.args.data.url === url);
        const summary = {
            request,
            url,
            entity,
            transferSize: node.transferSize,
            mainThreadTime: Types.Timing.Milli(node.selfTime),
        };
        summaries.push(summary);
    }
    return summaries;
}
// Use the same filtering as front_end/panels/timeline/TimelineTreeView.ts.
const exclusiveNameFilter = new TraceFilter.ExclusiveNameFilter([]);
const visibleEventsFilter = new TraceFilter.VisibleEventsFilter([...Helpers.Trace.VISIBLE_TRACE_EVENT_TYPES.values(), Types.Events.Name.SYNTHETIC_NETWORK_REQUEST]);
function getBottomUpTree(mainThreadEvents, tracebounds, groupingFunction) {
    // The bottom up root node handles all the "in Tracebounds" checks we need for the insight.
    const startTime = Helpers.Timing.microToMilli(tracebounds.min);
    const endTime = Helpers.Timing.microToMilli(tracebounds.max);
    return new TraceTree.BottomUpRootNode(mainThreadEvents, {
        textFilter: exclusiveNameFilter,
        filters: [visibleEventsFilter],
        startTime,
        endTime,
        eventGroupIdCallback: groupingFunction,
        calculateTransferSize: true,
        // Ensure we group by 3P alongside eventID for correct 3P grouping.
        forceGroupIdCallback: true,
    });
}
//# sourceMappingURL=ThirdParties.js.map