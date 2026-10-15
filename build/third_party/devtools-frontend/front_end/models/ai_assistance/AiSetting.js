// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Root from '../../core/root/root.js';
/**
 * Wrapper around a plain {@link Common.Settings.Setting} for AI features whose availability
 * can change dynamically over the lifetime of a DevTools session (e.g., due to changes in
 * AIDA availability, network connectivity, authentication, or enterprise policy).
 *
 * This wrapper listens to {@link Host.AidaClient.Events.AIDA_AVAILABILITY_CHANGED} and emits
 * {@link Events.CHANGED} when either the underlying setting value changes or when AIDA status
 * changes, allowing UI components to dynamically react without polluting the plain `Setting`
 * class with dynamic availability state.
 */
export class AiSetting extends Common.ObjectWrapper.ObjectWrapper {
    #setting;
    #descriptor;
    #hostConfigTracker;
    #settings;
    #boundOnSettingChanged = this.#onSettingChanged.bind(this);
    #boundOnAidaAvailabilityChanged = this.#onAidaAvailabilityChanged.bind(this);
    #isSubscribed = false;
    constructor(descriptor, hostConfigTracker, settings) {
        super();
        this.#descriptor = descriptor;
        this.#hostConfigTracker = hostConfigTracker;
        this.#settings = settings;
        this.#tryResolveSetting();
    }
    addEventListener(eventType, listener, thisObject) {
        const isFirst = !this.hasEventListeners(eventType);
        const descriptor = super.addEventListener(eventType, listener, thisObject);
        if (isFirst) {
            this.#subscribe();
        }
        return descriptor;
    }
    removeEventListener(eventType, listener, thisObject) {
        super.removeEventListener(eventType, listener, thisObject);
        if (!this.hasEventListeners(eventType)) {
            this.#unsubscribe();
        }
    }
    #subscribe() {
        if (this.#isSubscribed) {
            return;
        }
        this.#tryResolveSetting();
        this.#isSubscribed = true;
        this.#hostConfigTracker.addEventListener("aidaAvailabilityChanged" /* Host.AidaClient.Events.AIDA_AVAILABILITY_CHANGED */, this.#boundOnAidaAvailabilityChanged);
        this.#setting?.addChangeListener(this.#boundOnSettingChanged);
    }
    #unsubscribe() {
        if (!this.#isSubscribed) {
            return;
        }
        this.#isSubscribed = false;
        this.#hostConfigTracker.removeEventListener("aidaAvailabilityChanged" /* Host.AidaClient.Events.AIDA_AVAILABILITY_CHANGED */, this.#boundOnAidaAvailabilityChanged);
        this.#setting?.removeChangeListener(this.#boundOnSettingChanged);
    }
    #tryResolveSetting() {
        const result = this.#settings.maybeResolve(this.#descriptor);
        if ('setting' in result) {
            if (this.#setting !== result.setting) {
                if (this.#setting && this.#isSubscribed) {
                    this.#setting.removeChangeListener(this.#boundOnSettingChanged);
                }
                this.#setting = result.setting;
                if (this.#isSubscribed) {
                    this.#setting.addChangeListener(this.#boundOnSettingChanged);
                }
            }
        }
        else if (this.#setting) {
            if (this.#isSubscribed) {
                this.#setting.removeChangeListener(this.#boundOnSettingChanged);
            }
            this.#setting = undefined;
        }
    }
    get unavailable() {
        const availability = this.#descriptor.isAvailable(Root.Runtime.hostConfig);
        return availability.status === 2 /* Common.Settings.SettingAvailability.UNAVAILABLE */;
    }
    get disabled() {
        const availability = this.#descriptor.isAvailable(Root.Runtime.hostConfig);
        return availability.status === 3 /* Common.Settings.SettingAvailability.DISABLED */;
    }
    get disabledReasons() {
        const availability = this.#descriptor.isAvailable(Root.Runtime.hostConfig);
        if (availability.status === 3 /* Common.Settings.SettingAvailability.DISABLED */) {
            return availability.reason;
        }
        return [];
    }
    getIfNotDisabled() {
        if (this.disabled || this.unavailable) {
            return undefined;
        }
        this.#tryResolveSetting();
        return this.#setting?.get();
    }
    setIfNotDisabled(value) {
        if (this.disabled || this.unavailable) {
            return;
        }
        this.#tryResolveSetting();
        this.#setting?.set(value);
    }
    get() {
        return this.getIfNotDisabled();
    }
    set(value) {
        this.setIfNotDisabled(value);
    }
    #onSettingChanged() {
        this.dispatchEventToListeners("Changed" /* Events.CHANGED */);
    }
    #onAidaAvailabilityChanged() {
        this.#tryResolveSetting();
        this.dispatchEventToListeners("Changed" /* Events.CHANGED */);
    }
}
//# sourceMappingURL=AiSetting.js.map