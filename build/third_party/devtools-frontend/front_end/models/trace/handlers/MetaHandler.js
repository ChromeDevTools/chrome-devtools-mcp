// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
let config = Types.Configuration.defaults();
export function handleUserConfig(userConfig) {
    config = userConfig;
}
// We track the renderer processes we see in each frame on the way through the trace.
let rendererProcessesByFrameId = new Map();
// We will often want to key data by Frame IDs, and commonly we'll care most
// about the main frame's ID, so we store and expose that.
let mainFrameId = '';
let mainFrameURL = '';
let framesByProcessId = new Map();
// We will often want to key data by the browser process, GPU process and top
// level renderer IDs, so keep a track on those.
let browserProcessId = Types.Events.ProcessID(-1);
let browserThreadId = Types.Events.ThreadID(-1);
let gpuProcessId = Types.Events.ProcessID(-1);
let gpuThreadId = Types.Events.ThreadID(-1);
let viewportRect = null;
let devicePixelRatio = null;
let processNames = new Map();
let topLevelRendererIds = new Set();
function makeNewTraceBounds() {
    return {
        min: Types.Timing.Micro(Number.POSITIVE_INFINITY),
        max: Types.Timing.Micro(Number.NEGATIVE_INFINITY),
        range: Types.Timing.Micro(Number.POSITIVE_INFINITY),
    };
}
let traceBounds = makeNewTraceBounds();
/**
 * These represent the user navigating. Values such as First Contentful Paint,
 * etc, are relative to the navigation.
 *
 *  We store navigation events both by the frame and navigation ID. This means
 * when we need to look them up, we can use whichever ID we have.
 *
 * Note that these Maps will have the same values in them; these are just keyed
 * differently to make look-ups easier.
 *
 * We also additionally maintain an array of only navigations that occurred on
 * the main frame. In many places in the UI we only care about highlighting
 * main frame navigations, so calculating this list here is better than
 * filtering either of the below maps over and over again at the UI layer.
 */
let navigationsByFrameId = new Map();
let navigationsByNavigationId = new Map();
let softNavigationsById = new Map();
let finalDisplayUrlByNavigationId = new Map();
let mainFrameNavigations = [];
let sameDocumentNavigations = [];
// Represents all the threads in the trace, organized by process. This is mostly for internal
// bookkeeping so that during the finalize pass we can obtain the main and browser thread IDs.
let threadsInProcess = new Map();
let traceStartedTimeFromTracingStartedEvent = Types.Timing.Micro(-1);
const eventPhasesOfInterestForTraceBounds = new Set([
    Types.Events.Phase.BEGIN,
    Types.Events.Phase.END,
    Types.Events.Phase.COMPLETE,
    Types.Events.Phase.INSTANT,
]);
// Tracks if the trace is a generic trace, which here means that it did not come from athe DevTools Performance Panel recording.
// We assume a trace is generic, and mark it as not generic if we see any of:
// - TracingStartedInPage
// - TracingStartedInBrowser
// - TracingSessionIdForWorker
// - CpuProfile
// These are all events which indicate this is a Chrome browser trace.
let traceIsGeneric = true;
const CHROME_WEB_TRACE_EVENTS = new Set([
    Types.Events.Name.TRACING_STARTED_IN_PAGE,
    Types.Events.Name.TRACING_SESSION_ID_FOR_WORKER,
    Types.Events.Name.TRACING_STARTED_IN_BROWSER,
    Types.Events.Name.CPU_PROFILE,
]);
export function reset() {
    navigationsByFrameId = new Map();
    navigationsByNavigationId = new Map();
    softNavigationsById = new Map();
    finalDisplayUrlByNavigationId = new Map();
    processNames = new Map();
    mainFrameNavigations = [];
    sameDocumentNavigations = [];
    browserProcessId = Types.Events.ProcessID(-1);
    browserThreadId = Types.Events.ThreadID(-1);
    gpuProcessId = Types.Events.ProcessID(-1);
    gpuThreadId = Types.Events.ThreadID(-1);
    viewportRect = null;
    topLevelRendererIds = new Set();
    threadsInProcess = new Map();
    rendererProcessesByFrameId = new Map();
    framesByProcessId = new Map();
    traceBounds = makeNewTraceBounds();
    traceStartedTimeFromTracingStartedEvent = Types.Timing.Micro(-1);
    traceIsGeneric = true;
}
function updateRendererProcessByFrame(event, frame) {
    const framesInProcessById = Platform.MapUtilities.getWithDefault(framesByProcessId, frame.processId, () => new Map());
    framesInProcessById.set(frame.frame, frame);
    const rendererProcessInFrame = Platform.MapUtilities.getWithDefault(rendererProcessesByFrameId, frame.frame, () => new Map());
    const rendererProcessInfo = Platform.MapUtilities.getWithDefault(rendererProcessInFrame, frame.processId, () => {
        return [];
    });
    const lastProcessData = rendererProcessInfo.at(-1);
    // Only store a new entry if the URL changed, otherwise it's just
    // redundant information.
    if (lastProcessData && lastProcessData.frame.url === frame.url) {
        return;
    }
    // For now we store the time of the event as the min. In the finalize we step
    // through each of these windows and update their max and range values.
    rendererProcessInfo.push({
        frame,
        window: {
            min: event.ts,
            max: Types.Timing.Micro(0),
            range: Types.Timing.Micro(0),
        },
    });
}
export function handleEvent(event) {
    if (traceIsGeneric && CHROME_WEB_TRACE_EVENTS.has(event.name)) {
        traceIsGeneric = false;
    }
    if (Types.Events.isProcessName(event)) {
        processNames.set(event.pid, event);
    }
    // If there is a timestamp (which meta events do not have), and the event does
    // not end with ::UMA then it, and the event is in the set of valid phases,
    // then it should be included for the purposes of calculating the trace bounds.
    // The UMA events in particular seem to be reported on page unloading, which
    // often extends the bounds of the trace unhelpfully.
    if (event.ts !== 0 && !event.name.endsWith('::UMA') && eventPhasesOfInterestForTraceBounds.has(event.ph)) {
        traceBounds.min = Types.Timing.Micro(Math.min(event.ts, traceBounds.min));
        const eventDuration = event.dur ?? Types.Timing.Micro(0);
        traceBounds.max = Types.Timing.Micro(Math.max(event.ts + eventDuration, traceBounds.max));
    }
    if (Types.Events.isProcessName(event) && (event.args.name === 'Browser' || event.args.name === 'HeadlessBrowser')) {
        browserProcessId = event.pid;
        return;
    }
    if (Types.Events.isProcessName(event) && (event.args.name === 'Gpu' || event.args.name === 'GPU Process')) {
        gpuProcessId = event.pid;
        return;
    }
    if (Types.Events.isThreadName(event) && event.args.name === 'CrGpuMain') {
        gpuThreadId = event.tid;
        return;
    }
    if (Types.Events.isThreadName(event) && event.args.name === 'CrBrowserMain') {
        browserThreadId = event.tid;
    }
    if (Types.Events.isMainFrameViewport(event) && viewportRect === null) {
        const rectAsArray = event.args.data.viewport_rect;
        const viewportX = rectAsArray[0];
        const viewportY = rectAsArray[1];
        const viewportWidth = rectAsArray[2];
        const viewportHeight = rectAsArray[5];
        viewportRect = { x: viewportX, y: viewportY, width: viewportWidth, height: viewportHeight };
        devicePixelRatio = event.args.data.dpr ?? null;
    }
    // The TracingStartedInBrowser event includes the data on which frames are
    // in scope at the start of the trace. We use this to identify the frame with
    // no parent, i.e. the top level frame.
    if (Types.Events.isTracingStartedInBrowser(event)) {
        traceStartedTimeFromTracingStartedEvent = event.ts;
        if (!event.args.data) {
            throw new Error('No frames found in trace data');
        }
        for (const frame of (event.args.data.frames ?? [])) {
            updateRendererProcessByFrame(event, frame);
            if (!frame.parent) {
                topLevelRendererIds.add(frame.processId);
            }
            /**
             * The code here uses a few different methods to try to determine the main frame.
             * The ideal is that the frames have two flags present:
             *
             * 1. isOutermostMainFrame (added in April 2024 - crrev.com/c/5424783)
             * 2. isInPrimaryMainFrame (added in June 2024 - crrev.com/c/5595033)
             *
             * The frame where both of these are set to `true` is the main frame. The
             * reason we need both of these flags to have 100% confidence is because
             * with the introduction of MPArch and pre-rendering, we can have other
             * frames that are the outermost frame, but are not the primary process.
             * Relying on isOutermostMainFrame in isolation caused the engine to
             * incorrectly identify the wrong frame as main (see crbug.com/343873756).
             *
             * See https://source.chromium.org/chromium/chromium/src/+/main:docs/frame_trees.md
             * for a bit more context on FrameTrees in Chromium.
             *
             * To avoid breaking entirely for traces pre-June 2024 that don't have
             * both of these flags, we will fallback to less accurate methods:
             *
             * 1. If we have isOutermostMainFrame, we will use that
             *    (and accept we might get it wrong)
             * 2. If we don't have isOutermostMainFrame, we fallback to finding a
             *    frame that has a URL, but doesn't have a parent. This is a crude
             *    guess at the main frame...but better than nothing and is historically
             *    how DevTools identified the main frame.
             */
            const traceHasPrimaryMainFrameFlag = 'isInPrimaryMainFrame' in frame;
            const traceHasOutermostMainFrameFlag = 'isOutermostMainFrame' in frame;
            if (traceHasPrimaryMainFrameFlag && traceHasOutermostMainFrameFlag) {
                // Ideal situation: identify the main frame as the one that has both these flags set to true.
                if (frame.isInPrimaryMainFrame && frame.isOutermostMainFrame) {
                    mainFrameId = frame.frame;
                    mainFrameURL = frame.url;
                }
            }
            else if (traceHasOutermostMainFrameFlag) {
                // Less ideal: "guess" at the main thread by using this flag.
                if (frame.isOutermostMainFrame) {
                    mainFrameId = frame.frame;
                    mainFrameURL = frame.url;
                }
                // Worst case: guess by seeing if the frame doesn't have a parent, and does have a URL.
            }
            else if (!frame.parent && frame.url) {
                mainFrameId = frame.frame;
                mainFrameURL = frame.url;
            }
        }
        return;
    }
    // FrameCommittedInBrowser events tell us information about each frame
    // and we use these to track how long each individual renderer is active
    // for. We track all renderers here (top level and those in frames), but
    // for convenience we also populate a set of top level renderer IDs.
    if (Types.Events.isFrameCommittedInBrowser(event)) {
        const frame = event.args.data;
        if (!frame) {
            return;
        }
        updateRendererProcessByFrame(event, frame);
        if (frame.parent) {
            return;
        }
        topLevelRendererIds.add(frame.processId);
        return;
    }
    if (Types.Events.isCommitLoad(event)) {
        const frameData = event.args.data;
        if (!frameData) {
            return;
        }
        const { frame, name, url } = frameData;
        updateRendererProcessByFrame(event, { processId: event.pid, frame, name, url });
        return;
    }
    // Track all threads based on the process & thread IDs.
    if (Types.Events.isThreadName(event)) {
        const threads = Platform.MapUtilities.getWithDefault(threadsInProcess, event.pid, () => new Map());
        threads.set(event.tid, event);
        return;
    }
    // Track all navigation events. Note that there can be navigation start events
    // but where the documentLoaderURL is empty. As far as the trace rendering is
    // concerned, these events are noise so we filter them out here.
    // (The filtering of empty URLs is done in the isNavigationStart check)
    if (Types.Events.isNavigationStart(event) && event.args.data) {
        const navigationId = event.args.data.navigationId;
        if (navigationsByNavigationId.has(navigationId)) {
            // We have only ever seen this situation once, in crbug.com/1503982, where the user ran:
            // window.location.href = 'javascript:console.log("foo")'
            // In this situation two identical navigationStart events are emitted with the same data, URL and ID.
            // So, in this situation we drop/ignore any subsequent navigations if we have already seen that ID.
            return;
        }
        navigationsByNavigationId.set(navigationId, event);
        finalDisplayUrlByNavigationId.set(navigationId, event.args.data.documentLoaderURL);
        const frameId = event.args.frame;
        const existingFrameNavigations = navigationsByFrameId.get(frameId) || [];
        existingFrameNavigations.push(event);
        navigationsByFrameId.set(frameId, existingFrameNavigations);
        if (frameId === mainFrameId) {
            mainFrameNavigations.push(event);
        }
        return;
    }
    if (config.enableSoftNavigation && Types.Events.isSoftNavigationStart(event)) {
        softNavigationsById.set(event.args.context.performanceTimelineNavigationId, event);
    }
    // Update `finalDisplayUrlByNavigationId` to reflect the latest redirect for each navigation.
    if (Types.Events.isResourceSendRequest(event)) {
        if (event.args.data.resourceType !== 'Document') {
            return;
        }
        const maybeNavigationId = event.args.data.requestId;
        const navigation = navigationsByNavigationId.get(maybeNavigationId);
        if (!navigation) {
            return;
        }
        finalDisplayUrlByNavigationId.set(maybeNavigationId, event.args.data.url);
        return;
    }
    // Track history API navigations to compute final display URLs in finalize.
    if (Types.Events.isDidCommitSameDocumentNavigation(event)) {
        if (event.args.render_frame_host.frame_type !== 'PRIMARY_MAIN_FRAME') {
            return;
        }
        sameDocumentNavigations.push(event);
        return;
    }
}
export async function finalize(options) {
    config.showAllEvents = Boolean(options?.showAllEvents);
    // We try to set the minimum time by finding the event with the smallest
    // timestamp. However, if we also got a timestamp from the
    // TracingStartedInBrowser event, we should always use that.
    // But in some traces (for example, CPU profiles) we do not get that event,
    // hence why we need to check we got a timestamp from it before setting it.
    if (traceStartedTimeFromTracingStartedEvent >= 0) {
        traceBounds.min = traceStartedTimeFromTracingStartedEvent;
    }
    traceBounds.range = Types.Timing.Micro(traceBounds.max - traceBounds.min);
    // If we go from foo.com to example.com we will get a new renderer, and
    // therefore the "top level renderer" will have a different PID as it has
    // changed. Here we step through each renderer process and updated its window
    // bounds, such that we end up with the time ranges in the trace for when
    // each particular renderer started and stopped being the main renderer
    // process.
    for (const [, processWindows] of rendererProcessesByFrameId) {
        // Sort the windows by time; we cannot assume by default they arrive via
        // events in time order. Because we set the window bounds per-process based
        // on the time of the current + next window, we need them sorted in ASC
        // order.
        const processWindowValues = [...processWindows.values()].flat().sort((a, b) => {
            return a.window.min - b.window.min;
        });
        for (let i = 0; i < processWindowValues.length; i++) {
            const currentWindow = processWindowValues[i];
            const nextWindow = processWindowValues[i + 1];
            // For the last window we set its max to be positive infinity.
            // TODO: Move the trace bounds handler into meta so we can clamp first and last windows.
            if (!nextWindow) {
                currentWindow.window.max = Types.Timing.Micro(traceBounds.max);
                currentWindow.window.range = Types.Timing.Micro(traceBounds.max - currentWindow.window.min);
            }
            else {
                currentWindow.window.max = Types.Timing.Micro(nextWindow.window.min - 1);
                currentWindow.window.range = Types.Timing.Micro(currentWindow.window.max - currentWindow.window.min);
            }
        }
    }
    // Frame ids which we didn't register using either the TracingStartedInBrowser or
    // the FrameCommittedInBrowser events are considered noise, so we filter them out, as well
    // as the navigations that belong to such frames.
    for (const [frameId, navigations] of navigationsByFrameId) {
        // The frames in the rendererProcessesByFrameId map come only from the
        // TracingStartedInBrowser and FrameCommittedInBrowser events, so we can use it as point
        // of comparison to determine if a frameId should be discarded.
        if (rendererProcessesByFrameId.has(frameId)) {
            continue;
        }
        navigationsByFrameId.delete(frameId);
        for (const navigation of navigations) {
            if (!navigation.args.data) {
                continue;
            }
            navigationsByNavigationId.delete(navigation.args.data.navigationId);
        }
    }
    // Sometimes in traces the TracingStartedInBrowser event can give us an
    // incorrect initial URL for the main frame's URL - about:blank or the URL of
    // the previous page. This doesn't matter too much except we often use this
    // URL as the visual name of the trace shown to the user (e.g. in the history
    // dropdown). We can be more accurate by finding the first main frame
    // navigation, and using its URL, if we have it.
    // However, to avoid doing this in a case where the first navigation is far
    // into the trace's lifecycle, we only do this in situations where the first
    // navigation happened very soon (0.5 seconds) after the trace started
    // recording.
    const firstMainFrameNav = mainFrameNavigations.at(0);
    const firstNavTimeThreshold = Helpers.Timing.secondsToMicro(Types.Timing.Seconds(0.5));
    if (firstMainFrameNav) {
        const navigationIsWithinThreshold = firstMainFrameNav.ts - traceBounds.min < firstNavTimeThreshold;
        if (firstMainFrameNav.args.data?.isOutermostMainFrame && firstMainFrameNav.args.data?.documentLoaderURL &&
            navigationIsWithinThreshold) {
            mainFrameURL = firstMainFrameNav.args.data.documentLoaderURL;
        }
    }
    // Compute final display URLs for each hard navigation.
    // A hard navigation's final URL is updated by history API navigations (e.g. pushState).
    // However, if a soft navigation occurs, subsequent history API navigations belong to the
    // soft navigation and should not update the hard navigation's URL.
    const softNavs = Array.from(softNavigationsById.values()).sort((a, b) => a.ts - b.ts);
    // Create an array of intervals for each hard navigation.
    const hardNavs = [...mainFrameNavigations];
    // Add a faux navigation to cover the time before the first hard navigation, or the whole trace if there are none.
    const intervals = [
        { minTs: 0, maxTs: hardNavs.length > 0 ? hardNavs[0].ts : Infinity, key: '' },
        ...hardNavs.map((nav, i) => ({
            minTs: nav.ts,
            maxTs: i + 1 < hardNavs.length ? hardNavs[i + 1].ts : Infinity,
            key: nav.args.data?.navigationId ?? '',
        })),
    ];
    for (const { minTs, maxTs, key } of intervals) {
        // Find the first soft navigation within this hard navigation's time window.
        const firstSoftNav = softNavs.find(sn => sn.ts >= minTs && sn.ts < maxTs);
        // If a soft navigation occurred, we only consider history events before it.
        const effectiveMaxTs = firstSoftNav ? firstSoftNav.ts : maxTs;
        // Find the last history API navigation in the effective window.
        const historyEvents = sameDocumentNavigations.filter(hn => hn.ts >= minTs && hn.ts < effectiveMaxTs);
        const lastHistoryEvent = historyEvents.at(-1);
        if (lastHistoryEvent) {
            finalDisplayUrlByNavigationId.set(key, lastHistoryEvent.args.url);
        }
    }
}
export function data() {
    return {
        config,
        traceBounds,
        browserProcessId,
        browserThreadId,
        processNames,
        gpuProcessId,
        gpuThreadId: gpuThreadId === Types.Events.ThreadID(-1) ? undefined : gpuThreadId,
        viewportRect: viewportRect || undefined,
        devicePixelRatio: devicePixelRatio ?? undefined,
        mainFrameId,
        mainFrameURL,
        navigationsByFrameId,
        navigationsByNavigationId,
        softNavigationsById,
        finalDisplayUrlByNavigationId,
        threadsInProcess,
        rendererProcessesByFrame: rendererProcessesByFrameId,
        topLevelRendererIds,
        frameByProcessId: framesByProcessId,
        mainFrameNavigations,
        traceIsGeneric,
    };
}
//# sourceMappingURL=MetaHandler.js.map