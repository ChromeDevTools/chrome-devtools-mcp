// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../core/sdk/sdk.js';
export class TracingManager extends SDK.SDKModel.SDKModel {
    #tracingAgent;
    #activeClient;
    #eventsRetrieved;
    #finishing;
    constructor(target) {
        super(target);
        this.#tracingAgent = target.tracingAgent();
        target.registerTracingDispatcher(new TracingDispatcher(this));
        this.#activeClient = null;
        this.#eventsRetrieved = 0;
    }
    bufferUsage(usage, percentFull) {
        if (this.#activeClient) {
            this.#activeClient.tracingBufferUsage(usage || percentFull || 0);
        }
    }
    eventsCollected(events) {
        if (!this.#activeClient) {
            return;
        }
        this.#activeClient.traceEventsCollected(events);
        this.#eventsRetrieved += events.length;
        // CDP no longer provides an approximate_event_count AKA eventCount. It's always 0.
        // To give some idea of progress we'll compare to a large (900k event) trace.
        // And we'll clamp both sides so the user sees some progress, and never maxed at 99%
        const progress = Math.min((this.#eventsRetrieved / 900_000) + 0.15, 0.90);
        this.#activeClient.eventsRetrievalProgress(progress);
    }
    tracingComplete() {
        this.#eventsRetrieved = 0;
        if (this.#activeClient) {
            this.#activeClient.tracingComplete();
            this.#activeClient = null;
        }
        this.#finishing = false;
    }
    async reset() {
        // If we have an active client, we should try to stop
        // it before resetting it, else we will leave the
        // backend in a broken state where it thinks we are in
        // the middle of tracing, but we think we are not.
        // Then, any subsequent attempts to record will fail
        // because the backend will not let us start a second
        // tracing session.
        if (this.#activeClient) {
            await this.#tracingAgent.invoke_end();
        }
        this.#eventsRetrieved = 0;
        this.#activeClient = null;
        this.#finishing = false;
    }
    async start(client, categoryFilter, options = {}) {
        if (this.#activeClient) {
            throw new Error('Tracing is already started');
        }
        const bufferUsageReportingIntervalMs = 500;
        this.#activeClient = client;
        const args = {
            bufferUsageReportingInterval: bufferUsageReportingIntervalMs,
            transferMode: "ReportEvents" /* Protocol.Tracing.StartRequestTransferMode.ReportEvents */,
            traceConfig: {
                recordMode: "recordUntilFull" /* Protocol.Tracing.TraceConfigRecordMode.RecordUntilFull */,
                traceBufferSizeInKb: 1200 * 1000,
                includedCategories: categoryFilter.split(','),
            },
        };
        if (options.screenshotMaxSize !== undefined) {
            args.screenshotMaxSize = options.screenshotMaxSize;
        }
        if (options.screenshotMaxCount !== undefined) {
            args.screenshotMaxCount = options.screenshotMaxCount;
        }
        const response = await this.#tracingAgent.invoke_start(args);
        if (response.getError()) {
            this.#activeClient = null;
        }
        return response;
    }
    stop() {
        if (!this.#activeClient) {
            throw new Error('Tracing is not started');
        }
        if (this.#finishing) {
            throw new Error('Tracing is already being stopped');
        }
        this.#finishing = true;
        void this.#tracingAgent.invoke_end();
    }
}
class TracingDispatcher {
    #tracingManager;
    constructor(tracingManager) {
        this.#tracingManager = tracingManager;
    }
    // `eventCount` will always be 0 as perfetto no longer calculates `approximate_event_count`
    bufferUsage({ value, percentFull }) {
        this.#tracingManager.bufferUsage(value, percentFull);
    }
    dataCollected({ value }) {
        this.#tracingManager.eventsCollected(value);
    }
    tracingComplete() {
        this.#tracingManager.tracingComplete();
    }
}
SDK.SDKModel.SDKModel.register(TracingManager, { capabilities: 128 /* SDK.Target.Capability.TRACING */, autostart: false });
//# sourceMappingURL=TracingManager.js.map