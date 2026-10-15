// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Root from '../root/root.js';
import { Events as ResourceTreeModelEvents, ResourceTreeModel } from './ResourceTreeModel.js';
import { TargetManager } from './TargetManager.js';
/**
 * The FrameManager is a central storage for all #frames. It collects #frames from all
 * ResourceTreeModel-instances (one per target), so that #frames can be found by id
 * without needing to know their target.
 */
export class FrameManager extends Common.ObjectWrapper.ObjectWrapper {
    #eventListeners = new WeakMap();
    // Maps frameIds to #frames and a count of how many ResourceTreeModels contain this frame.
    // (OOPIFs are usually first attached to a new target and then detached from their old target,
    // therefore being contained in 2 models for a short period of time.)
    #frames = new Map();
    #framesForTarget = new Map();
    #outermostFrame = null;
    #transferringFramesDataCache = new Map();
    #awaitedFrames = new Map();
    constructor(targetManager) {
        super();
        targetManager.observeModels(ResourceTreeModel, this);
    }
    static instance({ forceNew } = { forceNew: false }) {
        if (!Root.DevToolsContext.globalInstance().has(FrameManager) || forceNew) {
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            Root.DevToolsContext.globalInstance().set(FrameManager, new FrameManager(TargetManager.instance()));
        }
        return Root.DevToolsContext.globalInstance().get(FrameManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(FrameManager);
    }
    modelAdded(resourceTreeModel) {
        const addListener = resourceTreeModel.addEventListener(ResourceTreeModelEvents.FrameAdded, this.frameAdded, this);
        const detachListener = resourceTreeModel.addEventListener(ResourceTreeModelEvents.FrameDetached, this.frameDetached, this);
        const navigatedListener = resourceTreeModel.addEventListener(ResourceTreeModelEvents.FrameNavigated, this.frameNavigated, this);
        const resourceAddedListener = resourceTreeModel.addEventListener(ResourceTreeModelEvents.ResourceAdded, this.resourceAdded, this);
        this.#eventListeners.set(resourceTreeModel, [addListener, detachListener, navigatedListener, resourceAddedListener]);
        this.#framesForTarget.set(resourceTreeModel.target().id(), new Set());
    }
    modelRemoved(resourceTreeModel) {
        const listeners = this.#eventListeners.get(resourceTreeModel);
        if (listeners) {
            Common.EventTarget.removeEventListeners(listeners);
        }
        // Iterate over this model's #frames and decrease their count or remove them.
        // (The ResourceTreeModel does not send FrameDetached events when a model
        // is removed.)
        const frameSet = this.#framesForTarget.get(resourceTreeModel.target().id());
        if (frameSet) {
            for (const frameId of frameSet) {
                this.decreaseOrRemoveFrame(frameId);
            }
        }
        this.#framesForTarget.delete(resourceTreeModel.target().id());
    }
    frameAdded(event) {
        const frame = event.data;
        const frameData = this.#frames.get(frame.id);
        // If the frame is already in the map, increase its count, otherwise add it to the map.
        if (frameData) {
            // In order to not lose the following attributes of a frame during
            // an OOPIF transfer we need to copy them to the new frame
            frame.setCreationStackTrace(frameData.frame.getCreationStackTraceData());
            this.#frames.set(frame.id, { frame, count: frameData.count + 1 });
        }
        else {
            // If the transferring frame's detached event is received before its frame added
            // event in the new target, the frame's cached attributes are reassigned.
            const cachedFrameAttributes = this.#transferringFramesDataCache.get(frame.id);
            if (cachedFrameAttributes?.creationStackTrace && cachedFrameAttributes?.creationStackTraceTarget) {
                frame.setCreationStackTrace({
                    creationStackTrace: cachedFrameAttributes.creationStackTrace,
                    creationStackTraceTarget: cachedFrameAttributes.creationStackTraceTarget,
                });
            }
            this.#frames.set(frame.id, { frame, count: 1 });
            this.#transferringFramesDataCache.delete(frame.id);
        }
        this.resetOutermostFrame();
        // Add the frameId to the the targetId's set of frameIds.
        const frameSet = this.#framesForTarget.get(frame.resourceTreeModel().target().id());
        if (frameSet) {
            frameSet.add(frame.id);
        }
        this.dispatchEventToListeners("FrameAddedToTarget" /* Events.FRAME_ADDED_TO_TARGET */, { frame });
        this.resolveAwaitedFrame(frame);
    }
    frameDetached(event) {
        const { frame, isSwap } = event.data;
        // Decrease the frame's count or remove it entirely from the map.
        this.decreaseOrRemoveFrame(frame.id);
        // If the transferring frame's detached event is received before its frame
        // added event in the new target, we persist some attributes of the frame here
        // so that later on the frame added event in the new target they can be reassigned.
        if (isSwap && !this.#frames.get(frame.id)) {
            const traceData = frame.getCreationStackTraceData();
            const cachedFrameAttributes = {
                ...(traceData.creationStackTrace && { creationStackTrace: traceData.creationStackTrace }),
                ...(traceData.creationStackTrace && { creationStackTraceTarget: traceData.creationStackTraceTarget }),
            };
            this.#transferringFramesDataCache.set(frame.id, cachedFrameAttributes);
        }
        // Remove the frameId from the target's set of frameIds.
        const frameSet = this.#framesForTarget.get(frame.resourceTreeModel().target().id());
        if (frameSet) {
            frameSet.delete(frame.id);
        }
    }
    frameNavigated(event) {
        const frame = event.data;
        this.dispatchEventToListeners("FrameNavigated" /* Events.FRAME_NAVIGATED */, { frame });
        if (frame.isOutermostFrame()) {
            this.dispatchEventToListeners("OutermostFrameNavigated" /* Events.OUTERMOST_FRAME_NAVIGATED */, { frame });
        }
    }
    resourceAdded(event) {
        this.dispatchEventToListeners("ResourceAdded" /* Events.RESOURCE_ADDED */, { resource: event.data });
    }
    decreaseOrRemoveFrame(frameId) {
        const frameData = this.#frames.get(frameId);
        if (frameData) {
            if (frameData.count === 1) {
                this.#frames.delete(frameId);
                this.resetOutermostFrame();
                this.dispatchEventToListeners("FrameRemoved" /* Events.FRAME_REMOVED */, { frameId });
            }
            else {
                frameData.count--;
            }
        }
    }
    /**
     * Looks for the outermost frame in `#frames` and sets `#outermostFrame` accordingly.
     *
     * Important: This method needs to be called everytime `#frames` is updated.
     */
    resetOutermostFrame() {
        const outermostFrames = this.getAllFrames().filter(frame => frame.isOutermostFrame());
        this.#outermostFrame = outermostFrames.length > 0 ? outermostFrames[0] : null;
    }
    /**
     * Returns the ResourceTreeFrame with a given frameId.
     * When a frame is being detached a new ResourceTreeFrame but with the same
     * frameId is created. Consequently getFrame() will return a different
     * ResourceTreeFrame after detachment. Callers of getFrame() should therefore
     * immediately use the function return value and not store it for later use.
     */
    getFrame(frameId) {
        const frameData = this.#frames.get(frameId);
        if (frameData) {
            return frameData.frame;
        }
        return null;
    }
    getAllFrames() {
        return Array.from(this.#frames.values(), frameData => frameData.frame);
    }
    getOutermostFrame() {
        return this.#outermostFrame;
    }
    async getOrWaitForFrame(frameId, notInTarget) {
        const frame = this.getFrame(frameId);
        if (frame && (!notInTarget || notInTarget !== frame.resourceTreeModel().target())) {
            return frame;
        }
        return await new Promise(resolve => {
            const waiting = this.#awaitedFrames.get(frameId);
            if (waiting) {
                waiting.push({ notInTarget, resolve });
            }
            else {
                this.#awaitedFrames.set(frameId, [{ notInTarget, resolve }]);
            }
        });
    }
    resolveAwaitedFrame(frame) {
        const waiting = this.#awaitedFrames.get(frame.id);
        if (!waiting) {
            return;
        }
        const newWaiting = waiting.filter(({ notInTarget, resolve }) => {
            if (!notInTarget || notInTarget !== frame.resourceTreeModel().target()) {
                resolve(frame);
                return false;
            }
            return true;
        });
        if (newWaiting.length > 0) {
            this.#awaitedFrames.set(frame.id, newWaiting);
        }
        else {
            this.#awaitedFrames.delete(frame.id);
        }
    }
}
//# sourceMappingURL=FrameManager.js.map