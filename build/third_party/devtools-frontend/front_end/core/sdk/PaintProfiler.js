// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { SDKModel } from './SDKModel.js';
export class PaintProfilerModel extends SDKModel {
    layerTreeAgent;
    constructor(target) {
        super(target);
        this.layerTreeAgent = target.layerTreeAgent();
    }
    async loadSnapshotFromFragments(tiles) {
        const { snapshotId } = await this.layerTreeAgent.invoke_loadSnapshot({ tiles });
        return snapshotId ? new PaintProfilerSnapshot(this, snapshotId) : null;
    }
    loadSnapshot(encodedPicture) {
        const fragment = { x: 0, y: 0, picture: encodedPicture };
        return this.loadSnapshotFromFragments([fragment]);
    }
    async makeSnapshot(layerId) {
        const { snapshotId } = await this.layerTreeAgent.invoke_makeSnapshot({ layerId });
        return snapshotId ? new PaintProfilerSnapshot(this, snapshotId) : null;
    }
}
export class PaintProfilerSnapshot {
    #paintProfilerModel;
    #id;
    #refCount;
    constructor(paintProfilerModel, snapshotId) {
        this.#paintProfilerModel = paintProfilerModel;
        this.#id = snapshotId;
        this.#refCount = 1;
    }
    release() {
        console.assert(this.#refCount > 0, 'release is already called on the object');
        if (!--this.#refCount) {
            void this.#paintProfilerModel.layerTreeAgent.invoke_releaseSnapshot({ snapshotId: this.#id });
        }
    }
    addReference() {
        ++this.#refCount;
        console.assert(this.#refCount > 0, 'Referencing a dead object');
    }
    async replay(scale, fromStep, toStep) {
        const response = await this.#paintProfilerModel.layerTreeAgent.invoke_replaySnapshot({ snapshotId: this.#id, fromStep, toStep, scale: scale || 1.0 });
        return response.dataURL;
    }
    async profile(clipRect) {
        const response = await this.#paintProfilerModel.layerTreeAgent.invoke_profileSnapshot({ snapshotId: this.#id, minRepeatCount: 5, minDuration: 1, clipRect: clipRect || undefined });
        return response.timings;
    }
    async commandLog() {
        const response = await this.#paintProfilerModel.layerTreeAgent.invoke_snapshotCommandLog({ snapshotId: this.#id });
        return response.commandLog ? response.commandLog.map((entry, index) => new PaintProfilerLogItem(entry, index)) :
            null;
    }
}
export class PaintProfilerLogItem {
    method;
    params;
    commandIndex;
    constructor(rawEntry, commandIndex) {
        this.method = rawEntry.method;
        this.params = rawEntry.params;
        this.commandIndex = commandIndex;
    }
}
SDKModel.register(PaintProfilerModel, { capabilities: 2 /* Capability.DOM */, autostart: false });
//# sourceMappingURL=PaintProfiler.js.map