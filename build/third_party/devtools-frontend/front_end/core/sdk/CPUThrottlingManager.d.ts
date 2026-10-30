import * as Common from '../../core/common/common.js';
import * as Protocol from '../../generated/protocol.js';
import { EmulationModel } from './EmulationModel.js';
import { type SDKModelObserver, TargetManager } from './TargetManager.js';
export declare enum CalibrationError {
    DEVICE_TOO_WEAK = "DEVICE_TOO_WEAK"
}
export interface CalibratedCPUThrottling {
    low?: number | CalibrationError;
    mid?: number | CalibrationError;
    actualScore?: number;
}
export import CPUPerformanceTier = Protocol.Emulation.SetCPUPerformanceOverrideRequestPerformanceTier;
export declare function numberToTier(value: number): CPUPerformanceTier;
export declare function tierToNumber(tier: CPUPerformanceTier): number;
export declare class CPUThrottlingManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDKModelObserver<EmulationModel> {
    #private;
    constructor(settings: Common.Settings.Settings, targetManager: TargetManager);
    initialize(): void;
    static instance(opts?: {
        forceNew?: boolean | null;
        settings?: Common.Settings.Settings;
        targetManager?: TargetManager;
    }): CPUThrottlingManager;
    static removeInstance(): void;
    cpuThrottlingRate(): number;
    calculatedCPUPerformanceTier(): CPUPerformanceTier | undefined;
    effectiveCPUPerformanceTier(): CPUPerformanceTier | undefined;
    setCPUThrottlingRate(rate: number): void;
    setHardwareConcurrency(concurrency: number): void;
    setCPUPerformanceTier(tier?: CPUPerformanceTier): void;
    hasPrimaryPageTargetSet(): boolean;
    getHardwareConcurrency(): Promise<number>;
    updateHostDefaultCPUPerformanceTier(): Promise<void>;
    modelAdded(emulationModel: EmulationModel): void;
    modelRemoved(_emulationModel: EmulationModel): void;
}
export declare const enum Events {
    RATE_CHANGED = "RateChanged",
    HARDWARE_CONCURRENCY_CHANGED = "HardwareConcurrencyChanged",
    CPU_PERFORMANCE_TIER_CHANGED = "CpuPerformanceTierChanged"
}
export interface EventTypes {
    [Events.RATE_CHANGED]: number;
    [Events.HARDWARE_CONCURRENCY_CHANGED]: number;
    [Events.CPU_PERFORMANCE_TIER_CHANGED]: CPUPerformanceTier | undefined;
}
