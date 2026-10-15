// Copyright 2019 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Root from '../root/root.js';
import { RuntimeModel } from './RuntimeModel.js';
import { TargetManager } from './TargetManager.js';
export class IsolateManager extends Common.ObjectWrapper.ObjectWrapper {
    #isolates = new Map();
    /**
     * Contains null while the isolateId is being retrieved.
     */
    #isolateIdByModel = new Map();
    #observers = new Set();
    #pollId = 0;
    #targetManager;
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    constructor(targetManager = TargetManager.instance()) {
        super();
        this.#targetManager = targetManager;
        this.#targetManager.observeModels(RuntimeModel, this);
    }
    static instance(opts = { forceNew: false }) {
        const { forceNew, targetManager } = opts;
        if (!Root.DevToolsContext.globalInstance().has(IsolateManager) || forceNew) {
            Root.DevToolsContext.globalInstance().set(IsolateManager, new IsolateManager(targetManager));
        }
        return Root.DevToolsContext.globalInstance().get(IsolateManager);
    }
    observeIsolates(observer) {
        if (this.#observers.has(observer)) {
            throw new Error('Observer can only be registered once');
        }
        if (!this.#observers.size) {
            void this.poll();
        }
        this.#observers.add(observer);
        for (const isolate of this.#isolates.values()) {
            observer.isolateAdded(isolate);
        }
    }
    modelAdded(model) {
        void this.#modelAdded(model);
    }
    async #modelAdded(model) {
        this.#isolateIdByModel.set(model, null);
        const isolateId = await model.isolateId();
        if (!this.#isolateIdByModel.has(model)) {
            // The model has been removed during await.
            return;
        }
        if (!isolateId) {
            this.#isolateIdByModel.delete(model);
            return;
        }
        this.#isolateIdByModel.set(model, isolateId);
        let isolate = this.#isolates.get(isolateId);
        if (!isolate) {
            isolate = new Isolate(isolateId, this);
            this.#isolates.set(isolateId, isolate);
        }
        isolate.models().add(model);
        if (isolate.models().size === 1) {
            for (const observer of this.#observers) {
                observer.isolateAdded(isolate);
            }
        }
        else {
            for (const observer of this.#observers) {
                observer.isolateChanged(isolate);
            }
        }
    }
    modelRemoved(model) {
        const isolateId = this.#isolateIdByModel.get(model);
        this.#isolateIdByModel.delete(model);
        if (!isolateId) {
            return;
        }
        const isolate = this.#isolates.get(isolateId);
        if (!isolate) {
            return;
        }
        isolate.models().delete(model);
        if (isolate.models().size) {
            for (const observer of this.#observers) {
                observer.isolateChanged(isolate);
            }
            return;
        }
        for (const observer of this.#observers) {
            observer.isolateRemoved(isolate);
        }
        this.#isolates.delete(isolateId);
    }
    isolateByModel(model) {
        return this.#isolates.get(this.#isolateIdByModel.get(model) || '') || null;
    }
    isolates() {
        return this.#isolates.values();
    }
    async poll() {
        const pollId = this.#pollId;
        while (pollId === this.#pollId) {
            await Promise.all(Array.from(this.isolates(), isolate => isolate.update()));
            await new Promise(r => globalThis.setTimeout(r, PollIntervalMs));
        }
    }
}
export const MemoryTrendWindowMs = 120e3;
const PollIntervalMs = 2e3;
export class Isolate {
    #id;
    #models;
    #usedHeapSize;
    #memoryTrend;
    #manager;
    constructor(id, manager) {
        this.#id = id;
        this.#manager = manager;
        this.#models = new Set();
        this.#usedHeapSize = 0;
        const count = MemoryTrendWindowMs / PollIntervalMs;
        this.#memoryTrend = new MemoryTrend(count);
    }
    id() {
        return this.#id;
    }
    models() {
        return this.#models;
    }
    runtimeModel() {
        return this.#models.values().next().value || null;
    }
    heapProfilerModel() {
        const runtimeModel = this.runtimeModel();
        return runtimeModel?.heapProfilerModel() ?? null;
    }
    async update() {
        const model = this.runtimeModel();
        const usage = model && await model.heapUsage();
        if (!usage) {
            return;
        }
        this.#usedHeapSize = usage.usedSize + (usage.embedderHeapUsedSize ?? 0) + (usage.backingStorageSize ?? 0);
        this.#memoryTrend.add(this.#usedHeapSize);
        this.#manager.dispatchEventToListeners("MemoryChanged" /* Events.MEMORY_CHANGED */, this);
    }
    samplesCount() {
        return this.#memoryTrend.count();
    }
    usedHeapSize() {
        return this.#usedHeapSize;
    }
    /**
     * bytes per millisecond
     */
    usedHeapSizeGrowRate() {
        return this.#memoryTrend.fitSlope();
    }
}
export class MemoryTrend {
    #maxCount;
    #base;
    #index;
    #x;
    #y;
    #sx;
    #sy;
    #sxx;
    #sxy;
    constructor(maxCount) {
        this.#maxCount = maxCount | 0;
        this.reset();
    }
    reset() {
        this.#base = Date.now();
        this.#index = 0;
        this.#x = [];
        this.#y = [];
        this.#sx = 0;
        this.#sy = 0;
        this.#sxx = 0;
        this.#sxy = 0;
    }
    count() {
        return this.#x.length;
    }
    add(heapSize, timestamp) {
        const x = typeof timestamp === 'number' ? timestamp : Date.now() - this.#base;
        const y = heapSize;
        if (this.#x.length === this.#maxCount) {
            // Turns into a cyclic buffer once it reaches the |#maxCount|.
            const x0 = this.#x[this.#index];
            const y0 = this.#y[this.#index];
            this.#sx -= x0;
            this.#sy -= y0;
            this.#sxx -= x0 * x0;
            this.#sxy -= x0 * y0;
        }
        this.#sx += x;
        this.#sy += y;
        this.#sxx += x * x;
        this.#sxy += x * y;
        this.#x[this.#index] = x;
        this.#y[this.#index] = y;
        this.#index = (this.#index + 1) % this.#maxCount;
    }
    fitSlope() {
        // We use the linear regression model to find the slope.
        const n = this.count();
        return n < 2 ? 0 : (this.#sxy - this.#sx * this.#sy / n) / (this.#sxx - this.#sx * this.#sx / n);
    }
}
//# sourceMappingURL=IsolateManager.js.map