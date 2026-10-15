// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Root from '../root/root.js';
import * as DispatchHttpRequestClient from './DispatchHttpRequestClient.js';
export var SubscriptionStatus;
(function (SubscriptionStatus) {
    SubscriptionStatus["ENABLED"] = "SUBSCRIPTION_STATE_ENABLED";
    SubscriptionStatus["PENDING"] = "SUBSCRIPTION_STATE_PENDING";
    SubscriptionStatus["CANCELED"] = "SUBSCRIPTION_STATE_CANCELED";
    SubscriptionStatus["REFUNDED"] = "SUBSCRIPTION_STATE_REFUNDED";
    SubscriptionStatus["AWAITING_FIX"] = "SUBSCRIPTION_STATE_AWAITING_FIX";
    SubscriptionStatus["ON_HOLD"] = "SUBSCRIPTION_STATE_ACCOUNT_ON_HOLD";
})(SubscriptionStatus || (SubscriptionStatus = {}));
export var SubscriptionTier;
(function (SubscriptionTier) {
    SubscriptionTier["PREMIUM_ANNUAL"] = "SUBSCRIPTION_TIER_PREMIUM_ANNUAL";
    SubscriptionTier["PREMIUM_MONTHLY"] = "SUBSCRIPTION_TIER_PREMIUM_MONTHLY";
    SubscriptionTier["PRO_ANNUAL"] = "SUBSCRIPTION_TIER_PRO_ANNUAL";
    SubscriptionTier["PRO_MONTHLY"] = "SUBSCRIPTION_TIER_PRO_MONTHLY";
})(SubscriptionTier || (SubscriptionTier = {}));
export var EligibilityStatus;
(function (EligibilityStatus) {
    EligibilityStatus["ELIGIBLE"] = "ELIGIBLE";
    EligibilityStatus["NOT_ELIGIBLE"] = "NOT_ELIGIBLE";
})(EligibilityStatus || (EligibilityStatus = {}));
export var EmailPreference;
(function (EmailPreference) {
    EmailPreference["ENABLED"] = "ENABLED";
    EmailPreference["DISABLED"] = "DISABLED";
})(EmailPreference || (EmailPreference = {}));
/**
 * The `batchGet` awards endpoint returns badge names with an
 * obfuscated user ID (e.g., `profiles/12345/awards/badge-name`).
 * This function normalizes them to use `me` instead of the ID
 * (e.g., `profiles/me/awards/badge-path`) to match the format
 * used for client-side requests.
 **/
function normalizeBadgeName(name) {
    return name.replace(/profiles\/[^/]+\/awards\//, 'profiles/me/awards/');
}
export const GOOGLE_DEVELOPER_PROGRAM_PROFILE_LINK = 'https://developers.google.com/profile/u/me';
const ORIGIN_APPLICATION_NAME = 'APPLICATION_CHROME_DEVTOOLS';
async function makeHttpRequest(request) {
    if (!isGdpProfilesAvailable()) {
        throw new DispatchHttpRequestClient.DispatchHttpRequestError(DispatchHttpRequestClient.ErrorType.HTTP_RESPONSE_UNAVAILABLE);
    }
    const response = await DispatchHttpRequestClient.makeHttpRequest(request);
    return response;
}
const SERVICE_NAME = 'gdpService';
export class GdpClient {
    #cachedProfilePromise;
    #cachedEligibilityPromise;
    static instance({ forceNew } = { forceNew: false }) {
        if (!Root.DevToolsContext.globalInstance().has(GdpClient) || forceNew) {
            Root.DevToolsContext.globalInstance().set(GdpClient, new GdpClient());
        }
        return Root.DevToolsContext.globalInstance().get(GdpClient);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(GdpClient);
    }
    /**
     * Fetches the user's GDP profile and eligibility status.
     *
     * It first attempts to fetch the profile. If the profile is not found
     * (a `NOT_FOUND` error), this is handled gracefully by treating the profile
     * as `null` and then proceeding to check for eligibility.
     *
     * @returns A promise that resolves with an object containing the `profile`
     * and `isEligible` status, or `null` if an unexpected error occurs.
     */
    async getProfile() {
        try {
            const profile = await this.#getProfile();
            return {
                profile,
                isEligible: true,
            };
        }
        catch (err) {
            if (err instanceof DispatchHttpRequestClient.DispatchHttpRequestError &&
                err.type === DispatchHttpRequestClient.ErrorType.HTTP_RESPONSE_UNAVAILABLE) {
                return null;
            }
        }
        try {
            const checkEligibilityResponse = await this.#checkEligibility();
            return {
                profile: null,
                isEligible: checkEligibilityResponse.createProfile === EligibilityStatus.ELIGIBLE,
            };
        }
        catch {
            return null;
        }
    }
    async #getProfile() {
        if (this.#cachedProfilePromise) {
            return await this.#cachedProfilePromise;
        }
        this.#cachedProfilePromise = makeHttpRequest({
            service: SERVICE_NAME,
            path: '/v1beta1/profile:get',
            method: 'GET',
        }).then(profile => {
            this.#cachedEligibilityPromise = Promise.resolve({ createProfile: EligibilityStatus.ELIGIBLE });
            return profile;
        });
        return await this.#cachedProfilePromise;
    }
    async #checkEligibility() {
        if (this.#cachedEligibilityPromise) {
            return await this.#cachedEligibilityPromise;
        }
        this.#cachedEligibilityPromise =
            makeHttpRequest({ service: SERVICE_NAME, path: '/v1beta1/eligibility:check', method: 'GET' });
        return await this.#cachedEligibilityPromise;
    }
    /**
     * @returns null if the request fails, the awarded badge names otherwise.
     */
    async getAwardedBadgeNames({ names }) {
        try {
            const response = await makeHttpRequest({
                service: SERVICE_NAME,
                path: '/v1beta1/profiles/me/awards:batchGet',
                method: 'GET',
                queryParams: {
                    allowMissing: 'true',
                    names,
                },
            });
            return new Set(response.awards?.map(award => normalizeBadgeName(award.name)) ?? []);
        }
        catch {
            return null;
        }
    }
    async createProfile({ user, emailPreference }) {
        try {
            const response = await makeHttpRequest({
                service: SERVICE_NAME,
                path: '/v1beta1/profiles',
                method: 'POST',
                body: JSON.stringify({
                    user,
                    newsletter_email: emailPreference,
                    creation_origin: {
                        origin_application: ORIGIN_APPLICATION_NAME,
                    },
                }),
            });
            this.#clearCache();
            return response;
        }
        catch {
            return null;
        }
    }
    #clearCache() {
        this.#cachedProfilePromise = undefined;
        this.#cachedEligibilityPromise = undefined;
    }
    async createAward({ name }) {
        try {
            const response = await makeHttpRequest({
                service: SERVICE_NAME,
                path: '/v1beta1/profiles/me/awards',
                method: 'POST',
                body: JSON.stringify({
                    awardingUri: 'devtools://devtools',
                    name,
                }),
            });
            return response;
        }
        catch {
            return null;
        }
    }
}
export function isGdpProfilesAvailable() {
    const isBaseFeatureEnabled = Boolean(Root.Runtime.hostConfig.devToolsGdpProfiles?.enabled);
    const isBrandedBuild = Boolean(Root.Runtime.hostConfig.devToolsGdpProfilesAvailability?.enabled);
    const isOffTheRecordProfile = Root.Runtime.hostConfig.isOffTheRecord;
    const isDisabledByEnterprisePolicy = getGdpProfilesEnterprisePolicy() === Root.Runtime.GdpProfilesEnterprisePolicyValue.DISABLED;
    return isBaseFeatureEnabled && isBrandedBuild && !isOffTheRecordProfile && !isDisabledByEnterprisePolicy;
}
export function getGdpProfilesEnterprisePolicy() {
    return (Root.Runtime.hostConfig.devToolsGdpProfilesAvailability?.enterprisePolicyValue ??
        Root.Runtime.GdpProfilesEnterprisePolicyValue.DISABLED);
}
export function isBadgesEnabled() {
    const isBadgesEnabledByEnterprisePolicy = getGdpProfilesEnterprisePolicy() === Root.Runtime.GdpProfilesEnterprisePolicyValue.ENABLED;
    const isBadgesEnabledByFeatureFlag = Boolean(Root.Runtime.hostConfig.devToolsGdpProfiles?.badgesEnabled);
    return isBadgesEnabledByEnterprisePolicy && isBadgesEnabledByFeatureFlag;
}
export function isStarterBadgeEnabled() {
    return Boolean(Root.Runtime.hostConfig.devToolsGdpProfiles?.starterBadgeEnabled);
}
//# sourceMappingURL=GdpClient.js.map