let instance = null;
/**
 * In multiple places we need to know if the trace we are working on is fresh
 * or not. We cannot store that data in the trace file's metadata (otherwise a
 * loaded trace file could claim to be fresh), so we store it here. When a new trace
 * is loaded, we set this flag accordingly.
 **/
export class Tracker {
    #freshRecordings = new WeakSet();
    static instance(opts = { forceNew: false }) {
        if (!instance || opts.forceNew) {
            instance = new Tracker();
        }
        return instance;
    }
    registerFreshRecording(data) {
        this.#freshRecordings.add(data);
    }
    recordingIsFresh(data) {
        return this.#freshRecordings.has(data);
    }
    recordingIsFreshOrEnhanced(data) {
        return this.#freshRecordings.has(data) || data.metadata.enhancedTraceVersion !== undefined;
    }
}
//# sourceMappingURL=FreshRecording.js.map