import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import { DebuggerModel, Location } from './DebuggerModel.js';
import type { RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class CPUProfilerModel extends SDKModel<EventTypes> implements ProtocolProxyApi.ProfilerDispatcher {
    #private;
    constructor(target: Target);
    runtimeModel(): RuntimeModel;
    debuggerModel(): DebuggerModel;
    consoleProfileStarted({ id, location, title }: Protocol.Profiler.ConsoleProfileStartedEvent): void;
    consoleProfileFinished({ id, location, profile, title }: Protocol.Profiler.ConsoleProfileFinishedEvent): void;
    private createEventDataFrom;
    startRecording(): Promise<unknown>;
    stopRecording(): Promise<Protocol.Profiler.Profile | null>;
    startPreciseCoverage(jsCoveragePerBlock: boolean, preciseCoverageDeltaUpdateCallback: ((arg0: number, arg2: Protocol.Profiler.ScriptCoverage[]) => Promise<void>) | null): Promise<unknown>;
    takePreciseCoverage(): Promise<{
        timestamp: number;
        coverage: Protocol.Profiler.ScriptCoverage[];
    }>;
    stopPreciseCoverage(): Promise<unknown>;
    preciseCoverageDeltaUpdate({ timestamp, result }: Protocol.Profiler.PreciseCoverageDeltaUpdateEvent): void;
}
export declare const enum Events {
    CONSOLE_PROFILE_STARTED = "ConsoleProfileStarted",
    CONSOLE_PROFILE_FINISHED = "ConsoleProfileFinished"
}
export interface EventTypes {
    [Events.CONSOLE_PROFILE_STARTED]: EventData;
    [Events.CONSOLE_PROFILE_FINISHED]: ProfileFinishedData;
}
export interface EventData {
    id: string;
    scriptLocation: Location;
    title: string;
    cpuProfilerModel: CPUProfilerModel;
}
export declare class ProfileFinishedData implements EventData {
    readonly id: string;
    readonly scriptLocation: Location;
    readonly title: string;
    readonly cpuProfilerModel: CPUProfilerModel;
    readonly cpuProfile: Protocol.Profiler.Profile;
    constructor(eventData: EventData, cpuProfile: Protocol.Profiler.Profile);
}
