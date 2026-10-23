import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import type { Badge, BadgeAction, BadgeContext } from './Badge.js';
export declare const receiveGdpBadgesSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
type BadgeClass = new (badgeContext: BadgeContext) => Badge;
export declare const enum BadgeTriggerReason {
    AWARD = "Award",
    STARTER_BADGE_SETTINGS_NUDGE = "StarterBadgeSettingsNudge",
    STARTER_BADGE_PROFILE_NUDGE = "StarterBadgeProfileNudge"
}
export declare const enum Events {
    BADGE_TRIGGERED = "BadgeTriggered"
}
export interface EventTypes {
    [Events.BADGE_TRIGGERED]: {
        badge: Badge;
        reason: BadgeTriggerReason;
    };
}
export declare class UserBadges extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    static readonly BADGE_REGISTRY: BadgeClass[];
    constructor(settings: Common.Settings.Settings, gdpClient: Host.GdpClient.GdpClient, inspectorFrontendHost: Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI);
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): UserBadges;
    initialize(): Promise<void>;
    snoozeStarterBadge(): void;
    dismissStarterBadge(): void;
    recordAction(action: BadgeAction): void;
    reconcileBadgesFinishedForTest(): void;
    isReceiveBadgesSettingEnabled(): boolean;
}
export {};
