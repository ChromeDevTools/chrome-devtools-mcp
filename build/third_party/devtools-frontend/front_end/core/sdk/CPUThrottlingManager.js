// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Root from '../root/root.js';
import { EmulationModel } from './EmulationModel.js';
import { cpuPerformanceSettingDescriptor } from './SDKSettings.js';
import { TargetManager } from './TargetManager.js';
export var CalibrationError;
(function (CalibrationError) {
    CalibrationError["DEVICE_TOO_WEAK"] = "DEVICE_TOO_WEAK";
})(CalibrationError || (CalibrationError = {}));
export var CPUPerformanceTier = Protocol.Emulation.SetCPUPerformanceOverrideRequestPerformanceTier;
export function numberToTier(value) {
    switch (value) {
        case 1:
            return "low" /* CPUPerformanceTier.Low */;
        case 2:
            return "mid" /* CPUPerformanceTier.Mid */;
        case 3:
            return "high" /* CPUPerformanceTier.High */;
        case 4:
            return "ultra" /* CPUPerformanceTier.Ultra */;
        default:
            // This defaults to UNKNOWN (0) if the value is out of range.
            return "unknown" /* CPUPerformanceTier.Unknown */;
    }
}
export function tierToNumber(tier) {
    switch (tier) {
        case "unknown" /* CPUPerformanceTier.Unknown */:
            return 0;
        case "low" /* CPUPerformanceTier.Low */:
            return 1;
        case "mid" /* CPUPerformanceTier.Mid */:
            return 2;
        case "high" /* CPUPerformanceTier.High */:
            return 3;
        case "ultra" /* CPUPerformanceTier.Ultra */:
            return 4;
    }
}
export class CPUThrottlingManager extends Common.ObjectWrapper.ObjectWrapper {
    #calibratedCpuThrottlingSetting;
    #cpuPerformanceSetting;
    #targetManager;
    #cpuThrottlingRate;
    #hardwareConcurrency;
    #hostDefaultCPUPerformanceTier;
    #manualCPUPerformanceOverride;
    #pendingMainTargetPromise;
    constructor(settings, targetManager) {
        super();
        this.#targetManager = targetManager;
        this.#cpuThrottlingRate = 1; // No throttling
        this.#calibratedCpuThrottlingSetting = settings.createSetting('calibrated-cpu-throttling', {}, "Global" /* Common.Settings.SettingStorageType.GLOBAL */);
        this.#cpuPerformanceSetting = settings.resolve(cpuPerformanceSettingDescriptor);
    }
    initialize() {
        this.#targetManager.observeModels(EmulationModel, this);
        this.#cpuPerformanceSetting.addChangeListener(this.#onCPUPerformanceSettingChanged, this);
        this.#onCPUPerformanceSettingChanged();
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!Root.DevToolsContext.globalInstance().has(CPUThrottlingManager) || forceNew) {
            /* eslint-disable @devtools/no-instance-of-migrated-singletons */
            const manager = new CPUThrottlingManager(opts.settings ?? Common.Settings.Settings.instance(), opts.targetManager ?? TargetManager.instance());
            /* eslint-enable @devtools/no-instance-of-migrated-singletons */
            manager.initialize();
            Root.DevToolsContext.globalInstance().set(CPUThrottlingManager, manager);
        }
        return Root.DevToolsContext.globalInstance().get(CPUThrottlingManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(CPUThrottlingManager);
    }
    cpuThrottlingRate() {
        return this.#cpuThrottlingRate;
    }
    calculatedCPUPerformanceTier() {
        // Return the calculated tier, based on the host hardware baseline and any active CPU throttling multiplier,
        // ignoring any manual override via the sensors panel.
        // https://docs.google.com/document/d/1cVUQxigT9GMJweyR4c5Gmj16DEE7GnMTWy-FFPMkl14
        const NOMINAL_SCORES = {
            LOW: 264,
            MID: 1000,
            HIGH: 2350,
            ULTRA: 3000,
        };
        const calibratedSetting = this.#calibratedCpuThrottlingSetting.get();
        const isCalibrated = typeof calibratedSetting.actualScore === 'number' && calibratedSetting.actualScore > 0;
        let rLow;
        let rMid;
        let rHigh;
        let rUltra;
        if (isCalibrated) {
            const sHost = calibratedSetting.actualScore;
            rLow = typeof calibratedSetting.low === 'number' ? calibratedSetting.low : 1.0;
            rMid = typeof calibratedSetting.mid === 'number' ? calibratedSetting.mid : 1.0;
            rHigh = Math.min(rMid, Math.max(sHost / NOMINAL_SCORES.HIGH, 1.0));
            rUltra = Math.min(rHigh, Math.max(sHost / NOMINAL_SCORES.ULTRA, 1.0));
        }
        else {
            // If the host default tier is undefined or unknown, return that.
            const hostTier = this.#hostDefaultCPUPerformanceTier;
            if (!hostTier || hostTier === "unknown" /* CPUPerformanceTier.Unknown */) {
                return hostTier;
            }
            let sHost;
            switch (hostTier) {
                case "low" /* CPUPerformanceTier.Low */:
                    sHost = NOMINAL_SCORES.LOW;
                    break;
                case "mid" /* CPUPerformanceTier.Mid */:
                    sHost = NOMINAL_SCORES.MID;
                    break;
                case "high" /* CPUPerformanceTier.High */:
                    sHost = NOMINAL_SCORES.HIGH;
                    break;
                default:
                    sHost = NOMINAL_SCORES.ULTRA;
                    break;
            }
            rLow = Math.max(sHost / NOMINAL_SCORES.LOW, 1.0);
            rMid = Math.max(sHost / NOMINAL_SCORES.MID, 1.0);
            rHigh = Math.max(sHost / NOMINAL_SCORES.HIGH, 1.0);
            rUltra = Math.max(sHost / NOMINAL_SCORES.ULTRA, 1.0);
        }
        const thetaLow = Math.sqrt(rLow * rMid);
        const thetaMid = Math.sqrt(rMid * rHigh);
        const thetaHigh = Math.sqrt(rHigh * rUltra);
        if (this.#cpuThrottlingRate >= thetaLow) {
            return "low" /* CPUPerformanceTier.Low */;
        }
        if (this.#cpuThrottlingRate >= thetaMid) {
            return "mid" /* CPUPerformanceTier.Mid */;
        }
        if (this.#cpuThrottlingRate >= thetaHigh) {
            return "high" /* CPUPerformanceTier.High */;
        }
        return "ultra" /* CPUPerformanceTier.Ultra */;
    }
    effectiveCPUPerformanceTier() {
        // Return the tier, applying the manual override, if any.
        if (this.#manualCPUPerformanceOverride !== undefined) {
            return this.#manualCPUPerformanceOverride;
        }
        return this.calculatedCPUPerformanceTier();
    }
    #onCPUPerformanceSettingChanged() {
        const val = this.#cpuPerformanceSetting.get();
        this.#manualCPUPerformanceOverride = val === 'no-override' ? undefined : val;
        this.#syncCPUPerformanceTier();
        if (this.#hostDefaultCPUPerformanceTier === undefined) {
            void this.updateHostDefaultCPUPerformanceTier();
        }
    }
    #activeCPUPerformanceOverride() {
        // If neither a manual override nor CPU throttling is enabled, no override is active.
        if (this.#manualCPUPerformanceOverride === undefined && this.#cpuThrottlingRate === 1) {
            return undefined;
        }
        return this.effectiveCPUPerformanceTier();
    }
    #syncCPUPerformanceTier() {
        // Synchronize with Chromium backend, via CDP.
        const activeOverride = this.#activeCPUPerformanceOverride();
        for (const emulationModel of this.#targetManager.models(EmulationModel)) {
            void emulationModel.setCPUPerformanceOverride(activeOverride);
        }
        // Notify UI and other listeners.
        this.dispatchEventToListeners("CpuPerformanceTierChanged" /* Events.CPU_PERFORMANCE_TIER_CHANGED */, this.effectiveCPUPerformanceTier());
    }
    setCPUThrottlingRate(rate) {
        if (rate === this.#cpuThrottlingRate) {
            return;
        }
        this.#cpuThrottlingRate = rate;
        for (const emulationModel of this.#targetManager.models(EmulationModel)) {
            void emulationModel.setCPUThrottlingRate(this.#cpuThrottlingRate);
        }
        this.dispatchEventToListeners("RateChanged" /* Events.RATE_CHANGED */, this.#cpuThrottlingRate);
        // Propagate changes to the effective tier only if not manually overridden.
        if (this.#manualCPUPerformanceOverride === undefined) {
            this.#syncCPUPerformanceTier();
            if (this.#hostDefaultCPUPerformanceTier === undefined) {
                void this.updateHostDefaultCPUPerformanceTier();
            }
        }
    }
    setHardwareConcurrency(concurrency) {
        this.#hardwareConcurrency = concurrency;
        for (const emulationModel of this.#targetManager.models(EmulationModel)) {
            void emulationModel.setHardwareConcurrency(concurrency);
        }
        this.dispatchEventToListeners("HardwareConcurrencyChanged" /* Events.HARDWARE_CONCURRENCY_CHANGED */, this.#hardwareConcurrency);
    }
    setCPUPerformanceTier(tier) {
        this.#cpuPerformanceSetting.set(tier ?? 'no-override');
    }
    hasPrimaryPageTargetSet() {
        // In some environments, such as Node, trying to check if we have a page
        // target may error. So if we get any errors here at all, assume that we do
        // not have a target.
        try {
            return this.#targetManager.primaryPageTarget() !== null;
        }
        catch {
            return false;
        }
    }
    async getHardwareConcurrency() {
        const target = this.#targetManager.primaryPageTarget();
        const existingCallback = this.#pendingMainTargetPromise;
        // If the main target hasn't attached yet, block callers until it appears.
        if (!target) {
            if (existingCallback) {
                return await new Promise(r => {
                    this.#pendingMainTargetPromise = (result) => {
                        r(result);
                        existingCallback(result);
                    };
                });
            }
            return await new Promise(r => {
                this.#pendingMainTargetPromise = r;
            });
        }
        const evalResult = await target.runtimeAgent().invoke_evaluate({ expression: 'navigator.hardwareConcurrency', returnByValue: true, silent: true, throwOnSideEffect: true });
        const error = evalResult.getError();
        if (error) {
            throw new Error(error);
        }
        const { result, exceptionDetails } = evalResult;
        if (exceptionDetails) {
            throw new Error(exceptionDetails.text);
        }
        return result.value;
    }
    async updateHostDefaultCPUPerformanceTier() {
        if (this.#activeCPUPerformanceOverride() !== undefined) {
            // We do not want to update the host default tier if an override has already been sent
            // to the backend (in which case, `navigator.cpuPerformance` would return the override).
            return;
        }
        const target = this.#targetManager.primaryPageTarget();
        if (!target) {
            return;
        }
        const evalResult = await target.runtimeAgent().invoke_evaluate({ expression: 'navigator.cpuPerformance', returnByValue: true, silent: true, throwOnSideEffect: true });
        if (evalResult.getError()) {
            return;
        }
        const { result, exceptionDetails } = evalResult;
        if (exceptionDetails || typeof result.value !== 'number') {
            return;
        }
        const detectedTier = numberToTier(result.value);
        if (this.#hostDefaultCPUPerformanceTier !== detectedTier) {
            this.#hostDefaultCPUPerformanceTier = detectedTier;
            this.#syncCPUPerformanceTier();
        }
    }
    modelAdded(emulationModel) {
        if (this.#cpuThrottlingRate !== 1) {
            void emulationModel.setCPUThrottlingRate(this.#cpuThrottlingRate);
        }
        if (this.#hardwareConcurrency !== undefined) {
            void emulationModel.setHardwareConcurrency(this.#hardwareConcurrency);
        }
        const activeOverride = this.#activeCPUPerformanceOverride();
        if (activeOverride !== undefined) {
            void emulationModel.setCPUPerformanceOverride(activeOverride);
        }
        // If there are any callers blocked on a getHardwareConcurrency call, let's wake them now.
        if (this.#pendingMainTargetPromise) {
            const existingCallback = this.#pendingMainTargetPromise;
            this.#pendingMainTargetPromise = undefined;
            void this.getHardwareConcurrency().then(existingCallback);
        }
    }
    modelRemoved(_emulationModel) {
        // Implemented as a requirement for being a SDKModelObserver.
    }
}
export var Events;
(function (Events) {
    Events["RATE_CHANGED"] = "RateChanged";
    Events["HARDWARE_CONCURRENCY_CHANGED"] = "HardwareConcurrencyChanged";
    Events["CPU_PERFORMANCE_TIER_CHANGED"] = "CpuPerformanceTierChanged";
})(Events || (Events = {}));
//# sourceMappingURL=CPUThrottlingManager.js.map