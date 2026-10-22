import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import type * as Platform from '../../core/platform/platform.js';
/**
 * The Google legal troubleshooter form that users are sent to when they
 * report a legal issue with AI generated content.
 */
export declare const REPORT_LEGAL_ISSUE_URL: Platform.DevToolsPath.UrlString;
export declare const enum DisabledReason {
    GEO_RESTRICTED = "geo-restricted",
    POLICY_RESTRICTED = "policy-restricted",
    WRONG_LOCALE = "wrong-locale",
    NOT_SUPPORTED = "not-supported"
}
export declare const consoleInsightsEnabledSettingDescriptor: Common.Settings.ConditionalSettingDescriptor<boolean, DisabledReason[]>;
export declare const aiAssistanceEnabledSettingDescriptor: Common.Settings.ConditionalSettingDescriptor<boolean, DisabledReason[]>;
export declare const aiAssistanceV2OptInChangeDialogSeenSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
export declare function isGeminiBranding(): boolean;
export declare function isNaturalLanguageInterfaceEnabled(): boolean;
export declare function isAiV2Enabled(): boolean;
/**
 * Returns true if context selection / dynamic context switching is enabled.
 *
 * In the legacy V1 architecture, this corresponds to the `ContextSelectionAgent`,
 * which dynamically routes conversations and allows changing the active context.
 * In the unified V2 architecture (`AiAgent2`), dynamic context selection is natively
 * supported across the single agent instance.
 *
 * This bridge function checks either flag during the transition phase and can be
 * removed in the future when V2 ships permanently and the V1 architecture is removed.
 */
export declare function isContextSelectionEnabled(): boolean;
/**
 * Preconditions determined entirely on the DevTools frontend side (e.g. Incognito
 * mode or age restrictions) that prevent AI assistance features from running.
 * These are evaluated independently of AIDA service-level availability.
 */
export declare const enum FrontendAccessPrecondition {
    IS_OFF_THE_RECORD = "is-off-the-record",
    AGE_RESTRICTED = "age-restricted"
}
/**
 * The unified set of preconditions that can disable AI assistance.
 * This is a union of low-level AIDA service availability preconditions
 * and DevTools frontend-specific preconditions.
 */
export type AccessPrecondition = Exclude<Host.AidaClient.AidaAccessPreconditions, Host.AidaClient.AidaAccessPreconditions.AVAILABLE> | FrontendAccessPrecondition;
/**
 * Returns the list of active preconditions currently preventing AI assistance from being enabled.
 * Checks local frontend constraints (e.g. incognito, age check) and combines them with the
 * provided AIDA service availability status.
 */
export declare function getDisabledReasons(aidaAvailability: Host.AidaClient.AidaAccessPreconditions): AccessPrecondition[];
export declare function getIconName(): string;
export interface OneShotPromptRequest {
    aidaClient: Host.AidaClient.AidaClient;
    preamble: string;
    query: string;
    clientFeature: Host.AidaClient.ClientFeature;
    temperature?: number;
    modelId?: string;
    userTier?: string;
    serverSideLoggingEnabled?: boolean;
    signal?: AbortSignal;
}
export declare function runOneShotPrompt({ aidaClient, preamble, query, clientFeature, temperature, modelId, userTier, serverSideLoggingEnabled, signal, }: OneShotPromptRequest): Promise<string>;
