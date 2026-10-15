// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
export class HeapProfilerModel extends SDKModel {
    #enabled = false;
    #heapProfilerAgent;
    #runtimeModel;
    constructor(target) {
        super(target);
        target.registerHeapProfilerDispatcher(new HeapProfilerDispatcher(this));
        this.#heapProfilerAgent = target.heapProfilerAgent();
        this.#runtimeModel = target.model(RuntimeModel);
    }
    debuggerModel() {
        return this.#runtimeModel.debuggerModel();
    }
    runtimeModel() {
        return this.#runtimeModel;
    }
    async enable() {
        if (this.#enabled) {
            return;
        }
        this.#enabled = true;
        await this.#heapProfilerAgent.invoke_enable();
    }
    async startSampling(samplingRateInBytes) {
        const defaultSamplingIntervalInBytes = 16384;
        const response = await this.#heapProfilerAgent.invoke_startSampling({ samplingInterval: samplingRateInBytes || defaultSamplingIntervalInBytes });
        return Boolean(response.getError());
    }
    async stopSampling() {
        const response = await this.#heapProfilerAgent.invoke_stopSampling();
        if (response.getError()) {
            throw new Error('Sampling profiler is not running.');
        }
        return response.profile;
    }
    async getSamplingProfile() {
        const response = await this.#heapProfilerAgent.invoke_getSamplingProfile();
        if (response.getError()) {
            return null;
        }
        return response.profile;
    }
    async collectGarbage() {
        const response = await this.#heapProfilerAgent.invoke_collectGarbage();
        return Boolean(response.getError());
    }
    async snapshotObjectIdForObjectId(objectId) {
        const response = await this.#heapProfilerAgent.invoke_getHeapObjectId({ objectId });
        if (response.getError()) {
            return null;
        }
        return response.heapSnapshotObjectId;
    }
    async objectForSnapshotObjectId(snapshotObjectId, objectGroupName) {
        const result = await this.#heapProfilerAgent.invoke_getObjectByHeapObjectId({ objectId: snapshotObjectId, objectGroup: objectGroupName });
        if (result.getError()) {
            return null;
        }
        return this.#runtimeModel.createRemoteObject(result.result);
    }
    async addInspectedHeapObject(snapshotObjectId) {
        const response = await this.#heapProfilerAgent.invoke_addInspectedHeapObject({ heapObjectId: snapshotObjectId });
        return Boolean(response.getError());
    }
    async takeHeapSnapshot(heapSnapshotOptions) {
        await this.target().targetManager().suspendAllTargets('heap-snapshot');
        try {
            await this.#heapProfilerAgent.invoke_takeHeapSnapshot(heapSnapshotOptions);
        }
        finally {
            await this.target().targetManager().resumeAllTargets();
        }
    }
    async startTrackingHeapObjects(recordAllocationStacks) {
        const response = await this.#heapProfilerAgent.invoke_startTrackingHeapObjects({ trackAllocations: recordAllocationStacks });
        return Boolean(response.getError());
    }
    async stopTrackingHeapObjects(reportProgress) {
        const response = await this.#heapProfilerAgent.invoke_stopTrackingHeapObjects({ reportProgress });
        return Boolean(response.getError());
    }
    heapStatsUpdate(samples) {
        this.dispatchEventToListeners("HeapStatsUpdate" /* Events.HEAP_STATS_UPDATED */, samples);
    }
    lastSeenObjectId(lastSeenObjectId, timestamp) {
        this.dispatchEventToListeners("LastSeenObjectId" /* Events.LAST_SEEN_OBJECT_ID */, { lastSeenObjectId, timestamp });
    }
    addHeapSnapshotChunk(chunk) {
        this.dispatchEventToListeners("AddHeapSnapshotChunk" /* Events.ADD_HEAP_SNAPSHOT_CHUNK */, chunk);
    }
    reportHeapSnapshotProgress(done, total, finished) {
        this.dispatchEventToListeners("ReportHeapSnapshotProgress" /* Events.REPORT_HEAP_SNAPSHOT_PROGRESS */, { done, total, finished });
    }
    resetProfiles() {
        this.dispatchEventToListeners("ResetProfiles" /* Events.RESET_PROFILES */, this);
    }
}
class HeapProfilerDispatcher {
    #heapProfilerModel;
    constructor(model) {
        this.#heapProfilerModel = model;
    }
    heapStatsUpdate({ statsUpdate }) {
        this.#heapProfilerModel.heapStatsUpdate(statsUpdate);
    }
    lastSeenObjectId({ lastSeenObjectId, timestamp }) {
        this.#heapProfilerModel.lastSeenObjectId(lastSeenObjectId, timestamp);
    }
    addHeapSnapshotChunk({ chunk }) {
        this.#heapProfilerModel.addHeapSnapshotChunk(chunk);
    }
    reportHeapSnapshotProgress({ done, total, finished }) {
        this.#heapProfilerModel.reportHeapSnapshotProgress(done, total, finished);
    }
    resetProfiles() {
        this.#heapProfilerModel.resetProfiles();
    }
}
SDKModel.register(HeapProfilerModel, { capabilities: 4 /* Capability.JS */, autostart: false });
//# sourceMappingURL=HeapProfilerModel.js.map