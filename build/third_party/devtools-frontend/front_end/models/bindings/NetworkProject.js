// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
const uiSourceCodeToAttributionMap = new WeakMap();
export class NetworkProjectManager extends Common.ObjectWrapper.ObjectWrapper {
    #projectToTargetMap = new WeakMap();
    #sourceURLSynthesizedUISourceCodes = new WeakSet();
    static instance({ forceNew } = { forceNew: false }) {
        if (!Root.DevToolsContext.globalInstance().has(NetworkProjectManager) || forceNew) {
            Root.DevToolsContext.globalInstance().set(NetworkProjectManager, new NetworkProjectManager());
        }
        return Root.DevToolsContext.globalInstance().get(NetworkProjectManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(NetworkProjectManager);
    }
    setTargetForProject(project, target) {
        this.#projectToTargetMap.set(project, target);
    }
    getTargetForProject(project) {
        return this.#projectToTargetMap.get(project) ?? null;
    }
    getTargetForUISourceCode(uiSourceCode) {
        return this.#projectToTargetMap.get(uiSourceCode.project()) ?? null;
    }
    setSourceURLSynthesized(uiSourceCode) {
        this.#sourceURLSynthesizedUISourceCodes.add(uiSourceCode);
    }
    isSourceURLSynthesized(uiSourceCode) {
        return this.#sourceURLSynthesizedUISourceCodes.has(uiSourceCode);
    }
}
export var Events;
(function (Events) {
    Events["FRAME_ATTRIBUTION_ADDED"] = "FrameAttributionAdded";
    Events["FRAME_ATTRIBUTION_REMOVED"] = "FrameAttributionRemoved";
})(Events || (Events = {}));
export class NetworkProject {
    /**
     * Records that `uiSourceCode` was synthesized from a `//# sourceURL=` annotation,
     * and therefore doesn't correspond to an actual network resource.
     */
    static setSourceURLSynthesized(uiSourceCode) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        NetworkProjectManager.instance().setSourceURLSynthesized(uiSourceCode);
    }
    /**
     * Whether `uiSourceCode` was synthesized from a `//# sourceURL=` annotation.
     *
     * Both the URL and the content of such a source are fully controlled by the page,
     * so it must never be treated like a genuine network resource (for example it must
     * not be persisted as a local override, see b/553931271).
     */
    static isSourceURLSynthesized(uiSourceCode) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        return NetworkProjectManager.instance().isSourceURLSynthesized(uiSourceCode);
    }
    static resolveFrame(uiSourceCode, frameId) {
        const target = NetworkProject.targetForUISourceCode(uiSourceCode);
        const resourceTreeModel = target?.model(SDK.ResourceTreeModel.ResourceTreeModel);
        return resourceTreeModel ? resourceTreeModel.frameForId(frameId) : null;
    }
    static setInitialFrameAttribution(uiSourceCode, frameId) {
        if (!frameId) {
            return;
        }
        const frame = NetworkProject.resolveFrame(uiSourceCode, frameId);
        if (!frame) {
            return;
        }
        const attribution = new Map();
        attribution.set(frameId, { frame, count: 1 });
        uiSourceCodeToAttributionMap.set(uiSourceCode, attribution);
    }
    static cloneInitialFrameAttribution(fromUISourceCode, toUISourceCode) {
        const fromAttribution = uiSourceCodeToAttributionMap.get(fromUISourceCode);
        if (!fromAttribution) {
            return;
        }
        const toAttribution = new Map();
        for (const frameId of fromAttribution.keys()) {
            const value = fromAttribution.get(frameId);
            if (typeof value !== 'undefined') {
                toAttribution.set(frameId, { frame: value.frame, count: value.count });
            }
        }
        uiSourceCodeToAttributionMap.set(toUISourceCode, toAttribution);
    }
    static addFrameAttribution(uiSourceCode, frameId) {
        const frame = NetworkProject.resolveFrame(uiSourceCode, frameId);
        if (!frame) {
            return;
        }
        const frameAttribution = uiSourceCodeToAttributionMap.get(uiSourceCode);
        if (!frameAttribution) {
            return;
        }
        const attributionInfo = frameAttribution.get(frameId) || { frame, count: 0 };
        attributionInfo.count += 1;
        frameAttribution.set(frameId, attributionInfo);
        if (attributionInfo.count !== 1) {
            return;
        }
        const data = { uiSourceCode, frame };
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        NetworkProjectManager.instance().dispatchEventToListeners("FrameAttributionAdded" /* Events.FRAME_ATTRIBUTION_ADDED */, data);
    }
    static removeFrameAttribution(uiSourceCode, frameId) {
        const frameAttribution = uiSourceCodeToAttributionMap.get(uiSourceCode);
        if (!frameAttribution) {
            return;
        }
        const attributionInfo = frameAttribution.get(frameId);
        console.assert(Boolean(attributionInfo), 'Failed to remove frame attribution for url: ' + uiSourceCode.url());
        if (!attributionInfo) {
            return;
        }
        attributionInfo.count -= 1;
        if (attributionInfo.count > 0) {
            return;
        }
        frameAttribution.delete(frameId);
        const data = { uiSourceCode, frame: attributionInfo.frame };
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        NetworkProjectManager.instance().dispatchEventToListeners("FrameAttributionRemoved" /* Events.FRAME_ATTRIBUTION_REMOVED */, data);
    }
    static targetForUISourceCode(uiSourceCode) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        return NetworkProjectManager.instance().getTargetForUISourceCode(uiSourceCode);
    }
    static setTargetForProject(project, target) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        NetworkProjectManager.instance().setTargetForProject(project, target);
    }
    static getTargetForProject(project) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        return NetworkProjectManager.instance().getTargetForProject(project);
    }
    static framesForUISourceCode(uiSourceCode) {
        const target = NetworkProject.targetForUISourceCode(uiSourceCode);
        const resourceTreeModel = target?.model(SDK.ResourceTreeModel.ResourceTreeModel);
        const attribution = uiSourceCodeToAttributionMap.get(uiSourceCode);
        if (!resourceTreeModel || !attribution) {
            return [];
        }
        const frames = Array.from(attribution.keys()).map(frameId => resourceTreeModel.frameForId(frameId));
        return frames.filter(frame => !!frame);
    }
}
//# sourceMappingURL=NetworkProject.js.map