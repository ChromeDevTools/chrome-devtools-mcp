import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import type { DisabledReason } from './AiUtils.js';
export declare const enum Events {
    CHANGED = "Changed"
}
export interface EventTypes {
    [Events.CHANGED]: void;
}
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
export declare class AiSetting<ValueT> extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(descriptor: Common.Settings.ConditionalSettingDescriptor<ValueT, DisabledReason[]>, hostConfigTracker: Host.AidaClient.HostConfigTracker, settings: Common.Settings.Settings);
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: Common.EventTarget.EventListener<EventTypes, T>, thisObject?: Object): Common.EventTarget.EventDescriptor<EventTypes, T>;
    removeEventListener<T extends keyof EventTypes>(eventType: T, listener: Common.EventTarget.EventListener<EventTypes, T>, thisObject?: Object): void;
    get unavailable(): boolean;
    get disabled(): boolean;
    get disabledReasons(): DisabledReason[];
    getIfNotDisabled(): ValueT | undefined;
    setIfNotDisabled(value: ValueT): void;
    get(): ValueT | undefined;
    set(value: ValueT): void;
}
