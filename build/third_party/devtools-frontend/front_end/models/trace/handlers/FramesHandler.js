// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
import { data as layerTreeHandlerData } from './LayerTreeHandler.js';
import { data as metaHandlerData } from './MetaHandler.js';
import { data as rendererHandlerData } from './RendererHandler.js';
import * as Threads from './Threads.js';
/**
 * IMPORTANT: this handler is slightly different to the rest. This is because
 * it is an adaptation of the TimelineFrameModel that has been used in DevTools
 * for many years. Rather than re-implement all the logic from scratch, instead
 * this handler gathers up the events and instantitates the class in the
 * finalize() method. Once the class has parsed all events, it is used to then
 * return the array of frames.
 *
 * In time we expect to migrate this code to a more "typical" handler.
 */
let model = null;
let relevantFrameEvents = [];
function isFrameEvent(event) {
    return (Types.Events.isSetLayerId(event) || Types.Events.isBeginFrame(event) || Types.Events.isDroppedFrame(event) ||
        Types.Events.isRequestMainThreadFrame(event) || Types.Events.isBeginMainThreadFrame(event) ||
        Types.Events.isNeedsBeginFrameChanged(event) ||
        // Note that "Commit" is the replacement for "CompositeLayers" so in a trace
        // we wouldn't expect to see a combination of these. All "new" trace
        // recordings use "Commit", but we can easily support "CompositeLayers" too
        // to not break older traces being imported.
        Types.Events.isCommit(event) || Types.Events.isCompositeLayers(event) ||
        Types.Events.isActivateLayerTree(event) || Types.Events.isDrawFrame(event));
}
function entryIsTopLevel(entry) {
    const devtoolsTimelineCategory = 'disabled-by-default-devtools.timeline';
    return entry.name === Types.Events.Name.RUN_TASK && entry.cat.includes(devtoolsTimelineCategory);
}
const MAIN_FRAME_MARKERS = new Set([
    Types.Events.Name.SCHEDULE_STYLE_RECALCULATION,
    Types.Events.Name.INVALIDATE_LAYOUT,
    Types.Events.Name.BEGIN_MAIN_THREAD_FRAME,
    Types.Events.Name.SCROLL_LAYER,
]);
export function reset() {
    model = null;
    relevantFrameEvents = [];
}
export function handleEvent(event) {
    // This might seem like a wide set of events to filter for, but these are all
    // the types of events that we care about in the TimelineFrameModel class at
    // the bottom of this file. Previously we would take a copy of an array of
    // all trace events, but on a few test traces, this set of filtered events
    // accounts for about 10% of the total events, so it's a big performance win
    // to deal with a much smaller subset of the data.
    if (isFrameEvent(event) || Types.Events.isLayerTreeHostImplSnapshot(event) || entryIsTopLevel(event) ||
        MAIN_FRAME_MARKERS.has(event.name) || Types.Events.isPaint(event)) {
        relevantFrameEvents.push(event);
    }
}
export async function finalize() {
    // We have to sort the events by timestamp, because the model code expects to
    // process events in order.
    Helpers.Trace.sortTraceEventsInPlace(relevantFrameEvents);
    const modelForTrace = new TimelineFrameModel(relevantFrameEvents, rendererHandlerData(), metaHandlerData(), layerTreeHandlerData());
    model = modelForTrace;
}
export function data() {
    return {
        frames: model?.frames() ?? [],
        framesById: model?.framesById() ?? {},
    };
}
export function deps() {
    return ['Meta', 'Renderer', 'LayerTree'];
}
export class TimelineFrameModel {
    #frames = [];
    #frameById = {};
    #beginFrameQueue = new TimelineFrameBeginFrameQueue();
    #lastFrame = null;
    #mainFrameCommitted = false;
    #mainFrameRequested = false;
    #lastLayerTree = null;
    #framePendingActivation = null;
    #framePendingCommit = null;
    #lastBeginFrame = null;
    #lastNeedsBeginFrame = null;
    #lastTaskBeginTime = null;
    #layerTreeId = null;
    #activeProcessId = null;
    #activeThreadId = null;
    #layerTreeData;
    constructor(allEvents, rendererData, metaData, layerTreeData) {
        // We only care about getting threads from the Renderer, not Samples,
        // because Frames don't exist in a CPU Profile (which won't have Renderer
        // threads.)
        const mainThreads = Threads.threadsInRenderer(rendererData).filter(thread => {
            return thread.type === Threads.ThreadType.MAIN_THREAD && thread.processIsOnMainFrame;
        });
        const threadData = mainThreads.map(thread => {
            return {
                tid: thread.tid,
                pid: thread.pid,
                startTime: thread.entries[0].ts,
            };
        });
        this.#layerTreeData = layerTreeData;
        this.#addTraceEvents(allEvents, threadData, metaData.mainFrameId);
    }
    framesById() {
        return this.#frameById;
    }
    frames() {
        return this.#frames;
    }
    #handleBeginFrame(startTime, seqId) {
        if (!this.#lastFrame) {
            this.#startFrame(startTime, seqId);
        }
        this.#lastBeginFrame = startTime;
        this.#beginFrameQueue.addFrameIfNotExists(seqId, startTime, false, false);
    }
    #handleDroppedFrame(startTime, seqId, isPartial) {
        if (!this.#lastFrame) {
            this.#startFrame(startTime, seqId);
        }
        // This line handles the case where no BeginFrame event is issued for
        // the dropped frame. In this situation, add a BeginFrame to the queue
        // as if it actually occurred.
        this.#beginFrameQueue.addFrameIfNotExists(seqId, startTime, true, isPartial);
        this.#beginFrameQueue.setDropped(seqId, true);
        this.#beginFrameQueue.setPartial(seqId, isPartial);
    }
    #handleDrawFrame(startTime, seqId) {
        if (!this.#lastFrame) {
            this.#startFrame(startTime, seqId);
            return;
        }
        // - if it wasn't drawn, it didn't happen!
        // - only show frames that either did not wait for the main thread frame or had one committed.
        if (this.#mainFrameCommitted || !this.#mainFrameRequested) {
            if (this.#lastNeedsBeginFrame) {
                const idleTimeEnd = this.#framePendingActivation ? this.#framePendingActivation.triggerTime :
                    (this.#lastBeginFrame || this.#lastNeedsBeginFrame);
                if (idleTimeEnd > this.#lastFrame.startTime) {
                    this.#lastFrame.idle = true;
                    this.#lastBeginFrame = null;
                }
                this.#lastNeedsBeginFrame = null;
            }
            const framesToVisualize = this.#beginFrameQueue.processPendingBeginFramesOnDrawFrame(seqId);
            // Visualize the current frame and all pending frames before it.
            for (const frame of framesToVisualize) {
                const isLastFrameIdle = this.#lastFrame.idle;
                // If |frame| is the first frame after an idle period, the CPU time
                // will be logged ("committed") under |frame| if applicable.
                this.#startFrame(frame.startTime, seqId);
                if (isLastFrameIdle && this.#framePendingActivation) {
                    this.#commitPendingFrame();
                }
                if (frame.isDropped) {
                    this.#lastFrame.dropped = true;
                }
                if (frame.isPartial) {
                    this.#lastFrame.isPartial = true;
                }
            }
        }
        this.#mainFrameCommitted = false;
    }
    #handleActivateLayerTree() {
        if (!this.#lastFrame) {
            return;
        }
        if (this.#framePendingActivation && !this.#lastNeedsBeginFrame) {
            this.#commitPendingFrame();
        }
    }
    #handleRequestMainThreadFrame() {
        if (!this.#lastFrame) {
            return;
        }
        this.#mainFrameRequested = true;
    }
    #handleCommit() {
        if (!this.#framePendingCommit) {
            return;
        }
        this.#framePendingActivation = this.#framePendingCommit;
        this.#framePendingCommit = null;
        this.#mainFrameRequested = false;
        this.#mainFrameCommitted = true;
    }
    #handleLayerTreeSnapshot(layerTree) {
        this.#lastLayerTree = layerTree;
    }
    #handleNeedFrameChanged(startTime, needsBeginFrame) {
        if (needsBeginFrame) {
            this.#lastNeedsBeginFrame = startTime;
        }
    }
    #startFrame(startTime, seqId) {
        if (this.#lastFrame) {
            this.#flushFrame(this.#lastFrame, startTime);
        }
        this.#lastFrame =
            new TimelineFrame(seqId, startTime, Types.Timing.Micro(startTime - metaHandlerData().traceBounds.min));
    }
    #flushFrame(frame, endTime) {
        frame.setLayerTree(this.#lastLayerTree);
        frame.setEndTime(endTime);
        if (this.#lastLayerTree) {
            this.#lastLayerTree.paints = frame.paints;
        }
        const lastFrame = this.#frames[this.#frames.length - 1];
        if (this.#frames.length && lastFrame &&
            (frame.startTime !== lastFrame.endTime || frame.startTime > frame.endTime)) {
            console.assert(false, `Inconsistent frame time for frame ${this.#frames.length} (${frame.startTime} - ${frame.endTime})`);
        }
        const newFramesLength = this.#frames.push(frame);
        frame.setIndex(newFramesLength - 1);
        if (typeof frame.mainFrameId === 'number') {
            this.#frameById[frame.mainFrameId] = frame;
        }
    }
    #commitPendingFrame() {
        if (!this.#framePendingActivation || !this.#lastFrame) {
            return;
        }
        this.#lastFrame.paints = this.#framePendingActivation.paints;
        this.#lastFrame.mainFrameId = this.#framePendingActivation.mainFrameId;
        this.#framePendingActivation = null;
    }
    #addTraceEvents(events, threadData, mainFrameId) {
        let j = 0;
        this.#activeThreadId = threadData.length && threadData[0].tid || null;
        this.#activeProcessId = threadData.length && threadData[0].pid || null;
        for (let i = 0; i < events.length; ++i) {
            while (j + 1 < threadData.length && threadData[j + 1].startTime <= events[i].ts) {
                this.#activeThreadId = threadData[++j].tid;
                this.#activeProcessId = threadData[j].pid;
            }
            this.#addTraceEvent(events[i], mainFrameId);
        }
        this.#activeThreadId = null;
        this.#activeProcessId = null;
    }
    #addTraceEvent(event, mainFrameId) {
        if (Types.Events.isSetLayerId(event) && event.args.data.frame === mainFrameId) {
            this.#layerTreeId = event.args.data.layerTreeId;
        }
        else if (Types.Events.isLayerTreeHostImplSnapshot(event) && Number(event.id) === this.#layerTreeId) {
            this.#handleLayerTreeSnapshot({
                entry: event,
                paints: [],
            });
        }
        else {
            if (isFrameEvent(event)) {
                this.#processCompositorEvents(event);
            }
            // Make sure we only use events from the main thread: we check the PID as
            // well in case two processes have a thread with the same TID.
            if (event.tid === this.#activeThreadId && event.pid === this.#activeProcessId) {
                this.#addMainThreadTraceEvent(event);
            }
        }
    }
    #processCompositorEvents(entry) {
        if (entry.args['layerTreeId'] !== this.#layerTreeId) {
            return;
        }
        if (Types.Events.isBeginFrame(entry)) {
            this.#handleBeginFrame(entry.ts, entry.args['frameSeqId']);
        }
        else if (Types.Events.isDrawFrame(entry)) {
            this.#handleDrawFrame(entry.ts, entry.args['frameSeqId']);
        }
        else if (Types.Events.isActivateLayerTree(entry)) {
            this.#handleActivateLayerTree();
        }
        else if (Types.Events.isRequestMainThreadFrame(entry)) {
            this.#handleRequestMainThreadFrame();
        }
        else if (Types.Events.isNeedsBeginFrameChanged(entry)) {
            // needsBeginFrame property will either be 0 or 1, which represents
            // true/false in this case, hence the Boolean() wrapper.
            this.#handleNeedFrameChanged(entry.ts, entry.args['data'] && Boolean(entry.args['data']['needsBeginFrame']));
        }
        else if (Types.Events.isDroppedFrame(entry)) {
            this.#handleDroppedFrame(entry.ts, entry.args['frameSeqId'], Boolean(entry.args['hasPartialUpdate']));
        }
    }
    #addMainThreadTraceEvent(entry) {
        if (entryIsTopLevel(entry)) {
            this.#lastTaskBeginTime = entry.ts;
        }
        if (!this.#framePendingCommit && MAIN_FRAME_MARKERS.has(entry.name)) {
            this.#framePendingCommit = new PendingFrame(this.#lastTaskBeginTime || entry.ts);
        }
        if (!this.#framePendingCommit) {
            return;
        }
        if (Types.Events.isBeginMainThreadFrame(entry) && entry.args.data.frameId) {
            this.#framePendingCommit.mainFrameId = entry.args.data.frameId;
        }
        if (Types.Events.isPaint(entry)) {
            const snapshot = this.#layerTreeData.paintsToSnapshots.get(entry);
            if (snapshot) {
                this.#framePendingCommit.paints.push(new LayerPaintEvent(entry, snapshot));
            }
        }
        // Commit will be replacing CompositeLayers but CompositeLayers is kept
        // around for backwards compatibility.
        if ((Types.Events.isCompositeLayers(entry) || Types.Events.isCommit(entry)) &&
            entry.args['layerTreeId'] === this.#layerTreeId) {
            this.#handleCommit();
        }
    }
}
/**
 * Legacy class that represents TimelineFrames that was ported from the old SDK.
 * This class is purposefully not exported as it breaks the abstraction that
 * every event shown on the timeline is a trace event. Instead, we use the Type
 * LegacyTimelineFrame to represent frames in the codebase. These do implement
 * the right interface to be treated just like they were a trace event.
 */
class TimelineFrame {
    // These fields exist to satisfy the base Event type which all
    // "trace events" must implement. They aren't used, but doing this means we
    // can pass `TimelineFrame` instances into places that expect
    // Types.Events.Event.
    cat = 'devtools.legacy_frame';
    name = 'frame';
    ph = Types.Events.Phase.COMPLETE;
    ts;
    pid = Types.Events.ProcessID(-1);
    tid = Types.Events.ThreadID(-1);
    index = -1;
    startTime;
    startTimeOffset;
    endTime;
    duration;
    idle;
    dropped;
    isPartial;
    layerTree;
    paints;
    mainFrameId;
    seqId;
    constructor(seqId, startTime, startTimeOffset) {
        this.seqId = seqId;
        this.startTime = startTime;
        this.ts = startTime;
        this.startTimeOffset = startTimeOffset;
        this.endTime = this.startTime;
        this.duration = Types.Timing.Micro(0);
        this.idle = false;
        this.dropped = false;
        this.isPartial = false;
        this.layerTree = null;
        this.paints = [];
        this.mainFrameId = undefined;
    }
    setIndex(i) {
        this.index = i;
    }
    setEndTime(endTime) {
        this.endTime = endTime;
        this.duration = Types.Timing.Micro(this.endTime - this.startTime);
    }
    setLayerTree(layerTree) {
        this.layerTree = layerTree;
    }
    /**
     * Fake the `dur` field to meet the expected value given that we pretend
     * these TimelineFrame classes are trace events across the codebase.
     */
    get dur() {
        return this.duration;
    }
}
export class LayerPaintEvent {
    #event;
    #snapshot;
    constructor(event, snapshot) {
        this.#event = event;
        this.#snapshot = snapshot;
    }
    layerId() {
        return this.#event.args.data.layerId;
    }
    event() {
        return this.#event;
    }
    picture() {
        const rect = this.#snapshot.args.snapshot.params?.layer_rect;
        const pictureData = this.#snapshot.args.snapshot.skp64;
        return rect && pictureData ? { rect, serializedPicture: pictureData } : null;
    }
}
export class PendingFrame {
    paints;
    mainFrameId;
    triggerTime;
    constructor(triggerTime) {
        this.paints = [];
        this.mainFrameId = undefined;
        this.triggerTime = triggerTime;
    }
}
/** The parameters of an impl-side BeginFrame. **/
class BeginFrameInfo {
    seqId;
    startTime;
    isDropped;
    isPartial;
    constructor(seqId, startTime, isDropped, isPartial) {
        this.seqId = seqId;
        this.startTime = startTime;
        this.isDropped = isDropped;
        this.isPartial = isPartial;
    }
}
/**
 * A queue of BeginFrames pending visualization.
 * BeginFrames are added into this queue as they occur; later when their
 * corresponding DrawFrames occur (or lack thereof), the BeginFrames are removed
 * from the queue and their timestamps are used for visualization.
 **/
export class TimelineFrameBeginFrameQueue {
    queueFrames = [];
    // Maps frameSeqId to BeginFrameInfo.
    mapFrames = new Map();
    // Add a BeginFrame to the queue, if it does not already exit.
    addFrameIfNotExists(seqId, startTime, isDropped, isPartial) {
        if (!this.mapFrames.has(seqId)) {
            this.mapFrames.set(seqId, new BeginFrameInfo(seqId, startTime, isDropped, isPartial));
            this.queueFrames.push(seqId);
        }
    }
    // Set a BeginFrame in queue as dropped.
    setDropped(seqId, isDropped) {
        const frame = this.mapFrames.get(seqId);
        if (frame) {
            frame.isDropped = isDropped;
        }
    }
    setPartial(seqId, isPartial) {
        const frame = this.mapFrames.get(seqId);
        if (frame) {
            frame.isPartial = isPartial;
        }
    }
    processPendingBeginFramesOnDrawFrame(seqId) {
        const framesToVisualize = [];
        // Do not visualize this frame in the rare case where the current DrawFrame
        // does not have a corresponding BeginFrame.
        if (this.mapFrames.has(seqId)) {
            // Pop all BeginFrames before the current frame, and add only the dropped
            // ones in |frames_to_visualize|.
            // Non-dropped frames popped here are BeginFrames that are never
            // drawn (but not considered dropped either for some reason).
            // Those frames do not require an proactive visualization effort and will
            // be naturally presented as continuationss of other frames.
            while (this.queueFrames[0] !== seqId) {
                const currentSeqId = this.queueFrames[0];
                const currentFrame = this.mapFrames.get(currentSeqId);
                if (currentFrame && currentFrame.isDropped) {
                    framesToVisualize.push(currentFrame);
                }
                this.mapFrames.delete(currentSeqId);
                this.queueFrames.shift();
            }
            // Pop the BeginFrame associated with the current DrawFrame.
            const frame = this.mapFrames.get(seqId);
            if (frame) {
                framesToVisualize.push(frame);
            }
            this.mapFrames.delete(seqId);
            this.queueFrames.shift();
        }
        return framesToVisualize;
    }
}
export function framesWithinWindow(frames, startTime, endTime) {
    const firstFrame = Platform.ArrayUtilities.lowerBound(frames, startTime || 0, (time, frame) => time - frame.endTime);
    const lastFrame = Platform.ArrayUtilities.lowerBound(frames, endTime || Infinity, (time, frame) => time - frame.startTime);
    return frames.slice(firstFrame, lastFrame);
}
//# sourceMappingURL=FramesHandler.js.map