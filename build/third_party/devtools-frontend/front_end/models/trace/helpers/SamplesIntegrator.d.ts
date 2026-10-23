import type * as Protocol from '../../../generated/protocol.js';
import type * as CPUProfile from '../../cpu_profile/cpu_profile.js';
import * as Types from '../types/types.js';
/**
 * This is a helper that integrates CPU profiling data coming in the
 * shape of samples, with trace events. Samples indicate what the JS
 * stack trace looked at a given point in time, but they don't have
 * duration. The SamplesIntegrator task is to make an approximation
 * of what the duration of each JS call was, given the sample data and
 * given the trace events profiled during that time. At the end of its
 * execution, the SamplesIntegrator returns an array of ProfileCalls
 * (under SamplesIntegrator::buildProfileCalls()), which
 * represent JS calls, with a call frame and duration. These calls have
 * the shape of a complete trace events and can be treated as flame
 * chart entries in the timeline.
 *
 * The approach to build the profile calls consists in tracking the
 * current stack as the following events happen (in order):
 * 1. A sample was done.
 * 2. A trace event started.
 * 3. A trace event ended.
 * Depending on the event and on the data that's coming with it the
 * stack is updated by adding or removing JS calls to it and updating
 * the duration of the calls in the tracking stack.
 *
 * note: Although this approach has been implemented since long ago, and
 * is relatively efficient (adds a complexity over the trace parsing of
 * O(n) where n is the number of samples) it has proven to be faulty.
 * It might be worthwhile experimenting with improvements or with a
 * completely different approach. Improving the approach is tracked in
 * crbug.com/1417439
 */
export declare class SamplesIntegrator {
    #private;
    /**
     * Keeps track of the individual samples from the CPU Profile.
     * Only used with Debug Mode experiment enabled.
     */
    jsSampleEvents: Types.Events.SyntheticJSSample[];
    constructor(profileModel: CPUProfile.CPUProfileDataModel.CPUProfileDataModel, profileId: Types.Events.ProfileID, pid: Types.Events.ProcessID, tid: Types.Events.ThreadID, configuration?: Types.Configuration.Configuration);
    buildProfileCalls(traceEvents: Types.Events.Event[]): Types.Events.SyntheticProfileCall[];
    /**
     * Builds the initial calls with no duration from samples. Their
     * purpose is to be merged with the trace event array being parsed so
     * that they can be traversed in order with them and their duration
     * can be updated as the SampleIntegrator callbacks are invoked.
     */
    callsFromProfileSamples(): Types.Events.SyntheticProfileCall[];
    static framesAreEqual(frame1: Protocol.Runtime.CallFrame, frame2: Protocol.Runtime.CallFrame): boolean;
    static showNativeName(name: string, runtimeCallStatsEnabled: boolean): boolean;
    static nativeGroup(nativeName: string): SamplesIntegrator.NativeGroups | null;
    static isNativeRuntimeFrame(frame: Protocol.Runtime.CallFrame): boolean;
    static filterStackFrames<T extends {
        callFrame: Protocol.Runtime.CallFrame;
    }>(stack: T[], engineConfig: Types.Configuration.Configuration): void;
    static createFakeTraceFromCpuProfile(profile: Protocol.Profiler.Profile, tid: Types.Events.ThreadID): Types.File.TraceFile;
    static extractCpuProfileFromFakeTrace(traceEvents: readonly Types.Events.Event[]): Protocol.Profiler.Profile;
}
export declare namespace SamplesIntegrator {
    enum NativeGroups {
        COMPILE = "Compile",
        PARSE = "Parse"
    }
}
