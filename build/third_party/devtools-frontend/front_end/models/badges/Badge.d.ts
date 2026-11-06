import * as Common from '../../core/common/common.js';
export declare enum BadgeAction {
    GDP_SIGN_UP_COMPLETE = "gdp-sign-up-complete",
    RECEIVE_BADGES_SETTING_ENABLED = "receive-badges-setting-enabled",
    CSS_RULE_MODIFIED = "css-rule-modified",
    DOM_ELEMENT_OR_ATTRIBUTE_EDITED = "dom-element-or-attribute-edited",
    MODERN_DOM_BADGE_CLICKED = "modern-dom-badge-clicked",
    STARTED_AI_CONVERSATION = "started-ai-conversation",
    PERFORMANCE_INSIGHT_CLICKED = "performance-insight-clicked",
    DEBUGGER_PAUSED = "debugger-paused",
    BREAKPOINT_ADDED = "breakpoint-added",
    CONSOLE_PROMPT_EXECUTED = "console-prompt-executed",
    PERFORMANCE_RECORDING_STARTED = "performance-recording-started",
    NETWORK_SPEED_THROTTLED = "network-speed-throttled",
    RECORDER_RECORDING_STARTED = "recorder-recording-started"
}
export type BadgeActionEvents = Record<BadgeAction, void>;
export interface BadgeContext {
    onTriggerBadge: (badge: Badge) => void;
    badgeActionEventTarget: Common.ObjectWrapper.ObjectWrapper<BadgeActionEvents>;
    settings: Common.Settings.Settings;
}
export interface TriggerOptions {
    immediate?: boolean;
}
export declare abstract class Badge {
    #private;
    abstract readonly name: string;
    abstract readonly title: string;
    abstract readonly imageUri: string;
    abstract readonly interestedActions: readonly BadgeAction[];
    abstract readonly jslogContext: string;
    readonly isStarterBadge: boolean;
    constructor(context: BadgeContext);
    abstract handleAction(action: BadgeAction): void;
    protected trigger(opts?: TriggerOptions): void;
    activate(): void;
    deactivate(): void;
}
