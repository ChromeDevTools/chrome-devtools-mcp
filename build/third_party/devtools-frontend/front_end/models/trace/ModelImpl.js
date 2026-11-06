// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import * as Handlers from './handlers/handlers.js';
import * as Helpers from './helpers/helpers.js';
import { TraceParseProgressEvent, TraceProcessor } from './Processor.js';
import * as Types from './types/types.js';
/**
 * The Model is responsible for parsing arrays of raw trace events and storing the
 * resulting data. It can store multiple traces at once, and can return the data for
 * any of them.
 *
 * Most uses of this class should be through `createWithAllHandlers`, but
 * `createWithSubsetOfHandlers` can be used to run just some handlers.
 **/
export class Model extends EventTarget {
    #traces = [];
    #nextNumberByDomain = new Map();
    #recordingsAvailable = [];
    #lastRecordingIndex = 0;
    #processor;
    #config = Types.Configuration.defaults();
    static createWithAllHandlers(config) {
        return new Model(Handlers.ModelHandlers, config);
    }
    /**
     * Runs only the provided handlers.
     *
     * Callers must ensure they are providing all dependant handlers (although Meta is included automatically),
     * and must know that the result of `.parsedTrace` will be limited to the handlers provided, even though
     * the type won't reflect that.
     */
    static createWithSubsetOfHandlers(traceHandlers, config) {
        return new Model(traceHandlers, config);
    }
    constructor(handlers, config) {
        super();
        if (config) {
            this.#config = config;
        }
        this.#processor = new TraceProcessor(handlers, this.#config);
    }
    updateConfiguration(config) {
        this.#config = config;
        this.#processor.updateConfiguration(config);
    }
    /**
     * Parses an array of trace events into a structured object containing all the
     * information parsed by the trace handlers.
     * You can `await` this function to pause execution until parsing is complete,
     * or instead rely on the `ModuleUpdateEvent` that is dispatched when the
     * parsing is finished.
     *
     * Once parsed, you then have to call the `parsedTrace` method, providing an
     * index of the trace you want to have the data for. This is because any model
     * can store a number of traces. Each trace is given an index, which starts at 0
     * and increments by one as a new trace is parsed.
     *
     * @example
     * // Awaiting the parse method() to block until parsing complete
     * await this.traceModel.parse(events);
     * const data = this.traceModel.parsedTrace(0)
     * @example
     * // Using an event listener to be notified when tracing is complete.
     * this.traceModel.addEventListener(Trace.ModelUpdateEvent.eventName, (event) => {
     *   if(event.data.data === 'done') {
     *     // trace complete
     *     const data = this.traceModel.parsedTrace(0);
     *   }
     * });
     * void this.traceModel.parse(events);
     **/
    async parse(traceEvents, config = {}) {
        if (config.showAllEvents === undefined) {
            config.showAllEvents = this.#config.showAllEvents;
        }
        const metadata = config.metadata || {};
        // During parsing, periodically update any listeners on each processors'
        // progress (if they have any updates).
        const onTraceUpdate = (event) => {
            const { data } = event;
            this.dispatchEvent(new ModelUpdateEvent({ type: ModelUpdateType.PROGRESS_UPDATE, data }));
        };
        this.#processor.addEventListener(TraceParseProgressEvent.eventName, onTraceUpdate);
        // TODO(cjamcl): this.#processor.parse needs this to work. So it should either take it as input, or create it itself.
        const syntheticEventsManager = Helpers.SyntheticEvents.SyntheticEventsManager.createAndActivate(traceEvents);
        try {
            // Wait for all outstanding promises before finishing the async execution,
            // but perform all tasks in parallel.
            await this.#processor.parse(traceEvents, config);
            if (!this.#processor.data) {
                throw new Error('processor did not parse trace');
            }
            const file = this.#storeAndCreateParsedTraceFile(syntheticEventsManager, traceEvents, metadata, this.#processor.data, this.#processor.insights);
            // Reclaim memory used by the temporary event-to-index lookup map now that trace parsing is complete.
            syntheticEventsManager.clearRegistrationIndex();
            // We only push the file onto this.#traces here once we know it's valid
            // and there's been no errors in the parsing.
            this.#traces.push(file);
        }
        catch (e) {
            throw e;
        }
        finally {
            // All processors have finished parsing, no more updates are expected.
            this.#processor.removeEventListener(TraceParseProgressEvent.eventName, onTraceUpdate);
            // Finally, update any listeners that all processors are 'done'.
            this.dispatchEvent(new ModelUpdateEvent({ type: ModelUpdateType.COMPLETE, data: 'done' }));
        }
    }
    #storeAndCreateParsedTraceFile(syntheticEventsManager, traceEvents, metadata, data, traceInsights) {
        this.#lastRecordingIndex++;
        let recordingName = `Trace ${this.#lastRecordingIndex}`;
        const origin = Helpers.Trace.extractOriginFromTrace(data.Meta.mainFrameURL);
        if (origin) {
            const nextSequenceForDomain = Platform.MapUtilities.getWithDefault(this.#nextNumberByDomain, origin, () => 1);
            recordingName = `${origin} (${nextSequenceForDomain})`;
            this.#nextNumberByDomain.set(origin, nextSequenceForDomain + 1);
        }
        this.#recordingsAvailable.push(recordingName);
        return {
            traceEvents,
            metadata,
            data,
            insights: traceInsights,
            syntheticEventsManager,
        };
    }
    lastTraceIndex() {
        return this.size() - 1;
    }
    /**
     * Returns the parsed trace data indexed by the order in which it was stored.
     * If no index is given, the last stored parsed data is returned.
     */
    parsedTrace(index = this.#traces.length - 1) {
        return this.#traces.at(index) ?? null;
    }
    overrideModifications(index, newModifications) {
        if (this.#traces[index]) {
            this.#traces[index].metadata.modifications = newModifications;
        }
    }
    syntheticTraceEventsManager(index = this.#traces.length - 1) {
        return this.#traces.at(index)?.syntheticEventsManager ?? null;
    }
    size() {
        return this.#traces.length;
    }
    deleteTraceByIndex(recordingIndex) {
        this.#traces.splice(recordingIndex, 1);
        this.#recordingsAvailable.splice(recordingIndex, 1);
    }
    indexForTrace(trace) {
        return this.#traces.indexOf(trace);
    }
    getRecordingsAvailable() {
        return this.#recordingsAvailable;
    }
    resetProcessor() {
        this.#processor.reset();
    }
}
export var ModelUpdateType;
(function (ModelUpdateType) {
    ModelUpdateType["COMPLETE"] = "COMPLETE";
    ModelUpdateType["PROGRESS_UPDATE"] = "PROGRESS_UPDATE";
})(ModelUpdateType || (ModelUpdateType = {}));
export class ModelUpdateEvent extends Event {
    data;
    static eventName = 'modelupdate';
    constructor(data) {
        super(ModelUpdateEvent.eventName);
        this.data = data;
    }
}
export function isModelUpdateDataComplete(eventData) {
    return eventData.type === ModelUpdateType.COMPLETE;
}
//# sourceMappingURL=ModelImpl.js.map