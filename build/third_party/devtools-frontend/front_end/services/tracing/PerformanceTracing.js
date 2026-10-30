// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Trace from '../../models/trace/trace.js';
import { TracingManager } from './TracingManager.js';
export class PerformanceTracing {
    #traceEvents = [];
    #tracingManager = null;
    #delegate;
    constructor(target, delegate) {
        this.#tracingManager = target.model(TracingManager);
        this.#delegate = delegate;
    }
    async start() {
        this.#traceEvents.length = 0;
        if (!this.#tracingManager) {
            throw new Error('No tracing manager');
        }
        // This panel may be opened with trace data recorded in other tools.
        const categories = [
            '-*',
            ...Trace.Types.Events.DefaultCategories,
            ...Trace.Types.Events.OptionalCategories.JsSampling,
            ...Trace.Types.Events.OptionalCategories.Screenshot,
            ...Trace.Types.Events.OptionalCategories.InvalidationTracking,
            'latencyInfo',
        ].join(',');
        const started = await this.#tracingManager.start(this, categories);
        if (!started) {
            throw new Error('Unable to start tracing.');
        }
    }
    async stop() {
        return this.#tracingManager?.stop();
    }
    // Start of implementation of SDK.TracingManager.TracingManagerClient
    traceEventsCollected(events) {
        this.#traceEvents.push(...events);
    }
    tracingBufferUsage(usage) {
        this.#delegate.tracingBufferUsage(usage);
    }
    eventsRetrievalProgress(progress) {
        this.#delegate.eventsRetrievalProgress(progress);
    }
    tracingComplete() {
        this.#delegate.tracingComplete(this.#traceEvents);
    }
}
/** Used by an implementation of Common.Revealer to transfer data from the recorder to the performance panel. **/
export class RawTraceEvents {
    events;
    constructor(events) {
        this.events = events;
    }
    getEvents() {
        return this.events;
    }
}
//# sourceMappingURL=PerformanceTracing.js.map