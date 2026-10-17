// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import { debugLog } from './debug.js';
function isLocaleRestricted() {
    try {
        const devtoolsLocale = i18n.DevToolsLocale.DevToolsLocale.instance();
        return !devtoolsLocale.locale.startsWith('en-');
    }
    catch {
        return false;
    }
}
function isGeoRestricted(config) {
    return config?.aidaAvailability?.blockedByGeo === true;
}
function isPolicyRestricted(config) {
    return config?.aidaAvailability?.blockedByEnterprisePolicy === true;
}
function isConsoleInsightsFeatureEnabled(config) {
    return config?.aidaAvailability?.enabled !== false && config?.devToolsConsoleInsights?.enabled === true;
}
export const consoleInsightsEnabledSettingDescriptor = {
    name: 'console-insights-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    isAvailable: (config) => {
        if (!isConsoleInsightsFeatureEnabled(config)) {
            return {
                status: 2 /* Common.Settings.SettingAvailability.UNAVAILABLE */,
                reason: ["not-supported" /* DisabledReason.NOT_SUPPORTED */],
            };
        }
        const reasons = [];
        if (isGeoRestricted(config)) {
            reasons.push("geo-restricted" /* DisabledReason.GEO_RESTRICTED */);
        }
        if (isPolicyRestricted(config)) {
            reasons.push("policy-restricted" /* DisabledReason.POLICY_RESTRICTED */);
        }
        if (isLocaleRestricted()) {
            reasons.push("wrong-locale" /* DisabledReason.WRONG_LOCALE */);
        }
        if (reasons.length > 0) {
            return {
                status: 3 /* Common.Settings.SettingAvailability.DISABLED */,
                reason: reasons,
            };
        }
        return {
            status: 1 /* Common.Settings.SettingAvailability.AVAILABLE */,
        };
    },
};
function isAiAssistanceFeatureAvailable(config) {
    return Boolean(config?.aidaAvailability?.enabled &&
        (config?.devToolsFreestyler?.enabled || config?.devToolsAiAssistanceNetworkAgent?.enabled ||
            config?.devToolsAiAssistancePerformanceAgent?.enabled ||
            config?.devToolsAiAssistanceFileAgent?.enabled || config?.devToolsAiAssistanceStorageAgent?.enabled));
}
export const aiAssistanceEnabledSettingDescriptor = {
    name: 'ai-assistance-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    isAvailable: (config) => {
        if (!isAiAssistanceFeatureAvailable(config)) {
            return {
                status: 2 /* Common.Settings.SettingAvailability.UNAVAILABLE */,
                reason: ["not-supported" /* DisabledReason.NOT_SUPPORTED */],
            };
        }
        const reasons = [];
        if (isGeoRestricted(config)) {
            reasons.push("geo-restricted" /* DisabledReason.GEO_RESTRICTED */);
        }
        if (isPolicyRestricted(config)) {
            reasons.push("policy-restricted" /* DisabledReason.POLICY_RESTRICTED */);
        }
        if (isLocaleRestricted()) {
            reasons.push("wrong-locale" /* DisabledReason.WRONG_LOCALE */);
        }
        if (reasons.length > 0) {
            return {
                status: 3 /* Common.Settings.SettingAvailability.DISABLED */,
                reason: reasons,
            };
        }
        return {
            status: 1 /* Common.Settings.SettingAvailability.AVAILABLE */,
        };
    },
};
export const aiAssistanceV2OptInChangeDialogSeenSettingDescriptor = {
    name: 'ai-assistance-v2-opt-in-change-dialog-seen',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export function isGeminiBranding() {
    return !!Root.Runtime.hostConfig.devToolsGeminiRebranding?.enabled;
}
export function isNaturalLanguageInterfaceEnabled() {
    return Boolean(Root.Runtime.hostConfig.devToolsAiNaturalLanguageInterface?.enabled);
}
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
export function isContextSelectionEnabled() {
    return Boolean(Root.Runtime.hostConfig.devToolsAiAssistanceContextSelectionAgent?.enabled) ||
        Boolean(Root.Runtime.hostConfig.devToolsAiV2Architecture?.enabled);
}
/**
 * Returns the list of active preconditions currently preventing AI assistance from being enabled.
 * Checks local frontend constraints (e.g. incognito, age check) and combines them with the
 * provided AIDA service availability status.
 */
export function getDisabledReasons(aidaAvailability) {
    const reasons = [];
    if (Root.Runtime.hostConfig.isOffTheRecord) {
        reasons.push("is-off-the-record" /* FrontendAccessPrecondition.IS_OFF_THE_RECORD */);
    }
    if (aidaAvailability !== "available" /* Host.AidaClient.AidaAccessPreconditions.AVAILABLE */) {
        reasons.push(aidaAvailability);
    }
    // No age check if there is no logged in user. Age check would always fail in that case.
    if ((aidaAvailability === "available" /* Host.AidaClient.AidaAccessPreconditions.AVAILABLE */ ||
        aidaAvailability === "no-internet" /* Host.AidaClient.AidaAccessPreconditions.NO_INTERNET */) &&
        Root.Runtime.hostConfig?.aidaAvailability?.blockedByAge === true) {
        reasons.push("age-restricted" /* FrontendAccessPrecondition.AGE_RESTRICTED */);
    }
    return reasons;
}
export function getIconName() {
    return isGeminiBranding() ? 'spark' : 'smart-assistant';
}
export async function runOneShotPrompt({ aidaClient, preamble, query, clientFeature, temperature, modelId, userTier, serverSideLoggingEnabled, signal, }) {
    const chromeVersion = Root.Runtime.getChromeVersion();
    if (!chromeVersion) {
        throw new Error('Cannot determine Chrome version');
    }
    const disallowLogging = !serverSideLoggingEnabled;
    const sessionId = crypto.randomUUID();
    const userTierEnum = Host.AidaClient.convertToUserTierEnum(userTier);
    const finalPreamble = userTierEnum === Host.AidaClient.UserTier.TESTERS ? preamble : undefined;
    const request = {
        client: Host.AidaClient.CLIENT_NAME,
        current_message: {
            parts: [{ text: query }],
            role: Host.AidaClient.Role.USER,
        },
        preamble: finalPreamble,
        options: {
            temperature: typeof temperature === 'number' && temperature >= 0 ? temperature : undefined,
            model_id: modelId || undefined,
        },
        metadata: {
            disable_user_content_logging: disallowLogging,
            string_session_id: sessionId,
            user_tier: userTierEnum,
            client_version: chromeVersion,
        },
        functionality_type: Host.AidaClient.FunctionalityType.CHAT,
        client_feature: clientFeature,
    };
    let textResponse = '';
    try {
        for await (const response of aidaClient.doConversation(request, { signal })) {
            if (response.explanation) {
                textResponse = response.explanation;
            }
        }
    }
    catch (err) {
        debugLog('Error calling AIDA for one-shot prompt', err);
        throw err;
    }
    return textResponse;
}
//# sourceMappingURL=AiUtils.js.map