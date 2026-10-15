// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import * as HandlerHelpers from './helpers.js';
import { data as metaHandlerData } from './MetaHandler.js';
import { data as networkRequestHandlerData } from './NetworkRequestsHandler.js';
import { data as samplesHandlerData } from './SamplesHandler.js';
/**
 * This handler builds the hierarchy of trace events and profile calls
 * on each thread on each process.
 *
 * Throughout the code, trace events and profile calls are referred to
 * as "entries", but note they are different types of data. Trace events
 * come directly from the backend and it's the type the engine commonly
 * refers to. Profile calls on the other hand are built in the frontend,
 * and, for compatibility purposes, typed as an extension to the trace
 * event type.
 */
let processes = new Map();
let entityMappings = {
    eventsByEntity: new Map(),
    entityByEvent: new Map(),
    createdEntityCache: new Map(),
    entityByUrlCache: new Map(),
};
// We track the compositor tile worker thread name events so that at the end we
// can return these keyed by the process ID. These are used in the frontend to
// show the user the rasterization thread(s) on the main frame as tracks.
let compositorTileWorkers = Array();
let entryToNode = new Map();
let completeEventStack = [];
let config = Types.Configuration.defaults();
const makeRendererProcess = () => ({
    url: null,
    isOnMainFrame: false,
    threads: new Map(),
});
const makeRendererThread = () => ({
    name: null,
    entries: [],
    profileCalls: [],
    layoutEvents: [],
    recalcStyleEvents: [],
});
const getOrCreateRendererProcess = (processes, pid) => {
    return Platform.MapUtilities.getWithDefault(processes, pid, makeRendererProcess);
};
const getOrCreateRendererThread = (process, tid) => {
    return Platform.MapUtilities.getWithDefault(process.threads, tid, makeRendererThread);
};
export function handleUserConfig(userConfig) {
    config = userConfig;
}
export function reset() {
    processes = new Map();
    entryToNode = new Map();
    entityMappings = {
        eventsByEntity: new Map(),
        entityByEvent: new Map(),
        createdEntityCache: new Map(),
        entityByUrlCache: new Map(),
    };
    completeEventStack = [];
    compositorTileWorkers = [];
}
export function handleEvent(event) {
    if (Types.Events.isThreadName(event) && event.args.name?.startsWith('CompositorTileWorker')) {
        compositorTileWorkers.push({
            pid: event.pid,
            tid: event.tid,
        });
    }
    if (Types.Events.isBegin(event) || Types.Events.isEnd(event)) {
        const process = getOrCreateRendererProcess(processes, event.pid);
        const thread = getOrCreateRendererThread(process, event.tid);
        const completeEvent = makeCompleteEvent(event);
        if (!completeEvent) {
            return;
        }
        thread.entries.push(completeEvent);
        return;
    }
    if (Types.Events.isInstant(event) || Types.Events.isComplete(event)) {
        const process = getOrCreateRendererProcess(processes, event.pid);
        const thread = getOrCreateRendererThread(process, event.tid);
        thread.entries.push(event);
    }
    if (Types.Events.isLayout(event)) {
        const process = getOrCreateRendererProcess(processes, event.pid);
        const thread = getOrCreateRendererThread(process, event.tid);
        thread.layoutEvents.push(event);
    }
    if (Types.Events.isRecalcStyle(event)) {
        const process = getOrCreateRendererProcess(processes, event.pid);
        const thread = getOrCreateRendererThread(process, event.tid);
        thread.recalcStyleEvents.push(event);
    }
}
export async function finalize() {
    const { mainFrameId, rendererProcessesByFrame, threadsInProcess } = metaHandlerData();
    entityMappings = networkRequestHandlerData().entityMappings;
    assignMeta(processes, mainFrameId, rendererProcessesByFrame, threadsInProcess);
    sanitizeProcesses(processes);
    buildHierarchy(processes);
    sanitizeThreads(processes);
}
export function data() {
    return {
        processes,
        compositorTileWorkers: gatherCompositorThreads(),
        entryToNode,
        entityMappings: {
            entityByEvent: entityMappings.entityByEvent,
            eventsByEntity: entityMappings.eventsByEntity,
            createdEntityCache: entityMappings.createdEntityCache,
            entityByUrlCache: entityMappings.entityByUrlCache,
        },
    };
}
function gatherCompositorThreads() {
    const threadsByProcess = new Map();
    for (const worker of compositorTileWorkers) {
        const byProcess = threadsByProcess.get(worker.pid) || [];
        byProcess.push(worker.tid);
        threadsByProcess.set(worker.pid, byProcess);
    }
    return threadsByProcess;
}
/**
 * Steps through all the renderer processes we've located so far in the meta
 * handler, obtaining their URL, checking whether they are the main frame, and
 * collecting each one of their threads' name. This meta handler's data is
 * assigned to the renderer handler's data.
 */
export function assignMeta(processes, mainFrameId, rendererProcessesByFrame, threadsInProcess) {
    assignOrigin(processes, rendererProcessesByFrame);
    assignIsMainFrame(processes, mainFrameId, rendererProcessesByFrame);
    assignThreadName(processes, threadsInProcess);
}
/**
 * Assigns origins to all threads in all processes.
 * @see assignMeta
 */
export function assignOrigin(processes, rendererProcessesByFrame) {
    for (const renderProcessesByPid of rendererProcessesByFrame.values()) {
        for (const [pid, processWindows] of renderProcessesByPid) {
            for (const processInfo of processWindows.flat()) {
                const process = getOrCreateRendererProcess(processes, pid);
                // Sometimes a single process is responsible with rendering multiple
                // frames at the same time. For example, see https://crbug.com/1334563.
                // When this happens, we'd still like to assign a single url per process
                // so: 1) use the first frame rendered by this process as the url source
                // and 2) if the last url is "about:blank", use the next frame's url,
                // data from about:blank is irrelevant.
                if (process.url === null || process.url === 'about:blank') {
                    // If we are here, it's because we care about this process and the URL. But before we store
                    // it, we check if it is a valid URL by trying to create a URL object. If it isn't, we won't
                    // set it, and this process will be filtered out later.
                    try {
                        new URL(processInfo.frame.url);
                        process.url = processInfo.frame.url;
                    }
                    catch {
                        process.url = null;
                    }
                }
            }
        }
    }
}
/**
 * Assigns whether or not a thread is the main frame to all threads in all processes.
 * @see assignMeta
 */
export function assignIsMainFrame(processes, mainFrameId, rendererProcessesByFrame) {
    for (const [frameId, renderProcessesByPid] of rendererProcessesByFrame) {
        for (const [pid] of renderProcessesByPid) {
            const process = getOrCreateRendererProcess(processes, pid);
            // We have this go in one direction; once a renderer has been flagged as
            // being on the main frame, we don't unset it to false if were to show up
            // in a subframe. Equally, if we already saw this renderer in a subframe,
            // but it becomes the main frame, the flag would get updated.
            if (frameId === mainFrameId) {
                process.isOnMainFrame = true;
            }
        }
    }
}
/**
 * Assigns the thread name to all threads in all processes.
 * @see assignMeta
 */
export function assignThreadName(processes, threadsInProcess) {
    for (const [pid, process] of processes) {
        for (const [tid, threadInfo] of threadsInProcess.get(pid) ?? []) {
            const thread = getOrCreateRendererThread(process, tid);
            thread.name = threadInfo?.args.name ?? `${tid}`;
        }
    }
}
/**
 * Removes unneeded trace data opportunistically stored while handling events.
 * This currently does the following:
 *  - Deletes processes with an unknown origin.
 */
export function sanitizeProcesses(processes) {
    const metaData = metaHandlerData();
    if (metaData.traceIsGeneric) {
        return;
    }
    for (const [pid, process] of processes) {
        // If the process had no url, or if it had a malformed url that could not be
        // parsed for some reason, or if it's an "about:" origin, delete it.
        // This is done because we don't really care about processes for which we
        // can't provide actionable insights to the user (e.g. about:blank pages).
        if (process.url === null) {
            processes.delete(pid);
            continue;
        }
    }
}
/**
 * Removes unneeded trace data opportunistically stored while handling events.
 * This currently does the following:
 *  - Deletes threads with no roots.
 */
export function sanitizeThreads(processes) {
    for (const [, process] of processes) {
        for (const [tid, thread] of process.threads) {
            // If the thread has no roots, delete it. Otherwise, there's going to
            // be space taken, even though nothing is rendered in the track manager.
            if (!thread.tree?.roots.size) {
                process.threads.delete(tid);
            }
        }
    }
}
/**
 * Creates a hierarchical structure from the trace events. Each thread in each
 * process will contribute to their own individual hierarchy.
 *
 * The trace data comes in as a contiguous array of events, against which we
 * make a couple of assumptions:
 *
 *  1. Events are temporally-ordered in terms of start time (though they're
 *     not necessarily ordered as such in the data stream).
 *  2. If event B's start and end times are within event A's time boundaries
 *     we assume that A is the parent of B.
 *
 * Therefore we expect to reformulate something like:
 *
 * [ Task A ][ Task B ][ Task C ][ Task D ][ Task E ]
 *
 * Into something hierarchically-arranged like below:
 *
 * |------------- Task A -------------||-- Task E --|
 *  |-- Task B --||-- Task D --|
 *   |- Task C -|
 */
export function buildHierarchy(processes, options) {
    // Ensure threads that only contain V8 CPU profiler samples (such as WebAssembly
    // background execution threads) are registered in their process before we iterate.
    // These threads do not receive standard renderer trace events, so their RendererThread
    // objects must be initialized here so SamplesIntegrator can inject profile calls.
    const samplesData = samplesHandlerData();
    for (const [pid, profilesByThread] of samplesData.profilesInProcess) {
        const process = processes.get(pid);
        if (!process) {
            continue;
        }
        for (const [tid] of profilesByThread) {
            getOrCreateRendererThread(process, tid);
        }
    }
    for (const [pid, process] of processes) {
        for (const [tid, thread] of process.threads) {
            // Step 1. Massage the data.
            Helpers.Trace.sortTraceEventsInPlace(thread.entries);
            // Step 2. Inject profile calls from samples
            const samplesDataForThread = samplesData.profilesInProcess.get(pid)?.get(tid);
            if (samplesDataForThread) {
                const cpuProfile = samplesDataForThread.parsedProfile;
                const samplesIntegrator = cpuProfile &&
                    new Helpers.SamplesIntegrator.SamplesIntegrator(cpuProfile, samplesDataForThread.profileId, pid, tid, config);
                const profileCalls = samplesIntegrator?.buildProfileCalls(thread.entries);
                if (samplesIntegrator && profileCalls) {
                    thread.entries = Helpers.Trace.mergeEventsInOrder(thread.entries, profileCalls);
                    thread.profileCalls = profileCalls;
                    // We'll also inject the instant JSSample events (in debug mode only)
                    const jsSamples = samplesIntegrator.jsSampleEvents;
                    if (jsSamples.length) {
                        thread.entries = Helpers.Trace.mergeEventsInOrder(thread.entries, jsSamples);
                    }
                }
            }
            if (!thread.entries.length) {
                thread.tree = Helpers.TreeHelpers.makeEmptyTraceEntryTree();
                continue;
            }
            // Step 3. Build the tree.
            const treeData = Helpers.TreeHelpers.treify(thread.entries, options);
            thread.tree = treeData.tree;
            // Update the entryToNode map with the entries from this thread
            for (const [entry, node] of treeData.entryToNode) {
                entryToNode.set(entry, node);
                // Entity mapping is unrelated to the tree, but calling here as we need to call on every node anyway.
                HandlerHelpers.addEventToEntityMapping(entry, entityMappings);
            }
        }
    }
}
export function makeCompleteEvent(event) {
    if (Types.Events.isEnd(event)) {
        // Quietly ignore unbalanced close events, they're legit (we could
        // have missed start one).
        const beginEvent = completeEventStack.pop();
        if (!beginEvent) {
            return null;
        }
        if (beginEvent.name !== event.name || beginEvent.cat !== event.cat) {
            console.error('Begin/End events mismatch at ' + beginEvent.ts + ' (' + beginEvent.name + ') vs. ' + event.ts + ' (' +
                event.name + ')');
            return null;
        }
        // Update the begin event's duration using the timestamp of the end
        // event.
        beginEvent.dur = Types.Timing.Micro(event.ts - beginEvent.ts);
        return null;
    }
    // Create a synthetic event using the begin event, when we find the
    // matching end event later we will update its duration.
    const syntheticComplete = {
        ...event,
        ph: Types.Events.Phase.COMPLETE,
        dur: Types.Timing.Micro(0),
    };
    completeEventStack.push(syntheticComplete);
    return syntheticComplete;
}
export function deps() {
    return ['Meta', 'Samples', 'NetworkRequests'];
}
//# sourceMappingURL=RendererHandler.js.map