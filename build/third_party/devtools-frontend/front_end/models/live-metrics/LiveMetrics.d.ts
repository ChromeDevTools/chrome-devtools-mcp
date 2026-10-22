import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as EmulationModel from '../../models/emulation/emulation.js';
import * as Spec from './web-vitals-injected/spec/spec.js';
export declare const timelineEnableSoftNavigationsSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
export type InteractionMap = Map<InteractionId, Interaction>;
export declare class LiveMetrics extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.Observer {
    #private;
    constructor(targetManager: SDK.TargetManager.TargetManager, settings: Common.Settings.Settings, deviceModeModel: EmulationModel.DeviceModeModel.DeviceModeModel | null);
    static instance(opts?: {
        forceNew?: boolean;
    }): LiveMetrics;
    get navigationType(): Spec.NavigationType | undefined;
    get lcpValue(): LcpValue | undefined;
    get clsValue(): ClsValue | undefined;
    get inpValue(): InpValue | undefined;
    get interactions(): InteractionMap;
    get layoutShifts(): LayoutShift[];
    /**
     * Will create a log message describing the interaction's LoAF scripts.
     * Returns true if the message is successfully logged.
     */
    logInteractionScripts(interaction: Interaction): Promise<boolean>;
    setStatusForTesting(status: StatusEvent): void;
    clearInteractions(): void;
    clearLayoutShifts(): void;
    targetAdded(target: SDK.Target.Target): Promise<void>;
    targetRemoved(target: SDK.Target.Target): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
}
export declare const enum Events {
    STATUS = "status"
}
export type InteractionId = `interaction-${number}-${number}`;
export interface MetricValue {
    value: number;
    warnings?: string[];
}
export interface LcpValue extends MetricValue {
    subparts: Spec.LcpSubparts;
    nodeRef?: SDK.DOMModel.DOMNode;
}
export interface InpValue extends MetricValue {
    subparts: Spec.InpSubparts;
    interactionId?: InteractionId;
}
export interface ClsValue extends MetricValue {
    clusterShiftIds: Spec.UniqueLayoutShiftId[];
}
export interface LayoutShift {
    score: number;
    uniqueLayoutShiftId: Spec.UniqueLayoutShiftId;
    affectedNodeRefs: SDK.DOMModel.DOMNode[];
}
export interface Interaction {
    interactionId: InteractionId;
    interactionType?: Spec.InteractionEntryEvent['interactionType'];
    eventNames: string[];
    duration: number;
    startTime: number;
    nextPaintTime?: number;
    subparts: Spec.InpSubparts;
    longAnimationFrameTimings: Spec.PerformanceLongAnimationFrameTimingJSON[];
    nodeRef?: SDK.DOMModel.DOMNode;
}
export interface StatusEvent {
    lcp?: LcpValue;
    cls?: ClsValue;
    inp?: InpValue;
    interactions: InteractionMap;
    layoutShifts: LayoutShift[];
    navigationType?: Spec.NavigationType;
}
interface EventTypes {
    [Events.STATUS]: StatusEvent;
}
export {};
