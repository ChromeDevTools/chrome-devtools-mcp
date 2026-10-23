import * as Root from '../root/root.js';
export declare enum SubscriptionStatus {
    ENABLED = "SUBSCRIPTION_STATE_ENABLED",
    PENDING = "SUBSCRIPTION_STATE_PENDING",
    CANCELED = "SUBSCRIPTION_STATE_CANCELED",
    REFUNDED = "SUBSCRIPTION_STATE_REFUNDED",
    AWAITING_FIX = "SUBSCRIPTION_STATE_AWAITING_FIX",
    ON_HOLD = "SUBSCRIPTION_STATE_ACCOUNT_ON_HOLD"
}
export declare enum SubscriptionTier {
    PREMIUM_ANNUAL = "SUBSCRIPTION_TIER_PREMIUM_ANNUAL",
    PREMIUM_MONTHLY = "SUBSCRIPTION_TIER_PREMIUM_MONTHLY",
    PRO_ANNUAL = "SUBSCRIPTION_TIER_PRO_ANNUAL",
    PRO_MONTHLY = "SUBSCRIPTION_TIER_PRO_MONTHLY"
}
export declare enum EligibilityStatus {
    ELIGIBLE = "ELIGIBLE",
    NOT_ELIGIBLE = "NOT_ELIGIBLE"
}
export declare enum EmailPreference {
    ENABLED = "ENABLED",
    DISABLED = "DISABLED"
}
export interface Award {
    name: string;
    badge: {
        title: string;
        description: string;
        imageUri: string;
        deletableByUser: boolean;
    };
    title: string;
    description: string;
    imageUri: string;
    createTime: string;
    awardingUri: string;
}
export interface Profile {
    name: string;
    activeSubscription?: {
        subscriptionStatus: SubscriptionStatus;
        subscriptionTier: SubscriptionTier | string;
    };
}
export interface GetProfileResponse {
    profile: Profile | null;
    isEligible: boolean;
}
export declare const GOOGLE_DEVELOPER_PROGRAM_PROFILE_LINK = "https://developers.google.com/profile/u/me";
export declare class GdpClient {
    #private;
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): GdpClient;
    static removeInstance(): void;
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
    getProfile(): Promise<GetProfileResponse | null>;
    /**
     * @returns null if the request fails, the awarded badge names otherwise.
     */
    getAwardedBadgeNames({ names }: {
        names: string[];
    }): Promise<Set<string> | null>;
    createProfile({ user, emailPreference }: {
        user: string;
        emailPreference: EmailPreference;
    }): Promise<Profile | null>;
    createAward({ name }: {
        name: string;
    }): Promise<Award | null>;
}
export declare function isGdpProfilesAvailable(): boolean;
export declare function getGdpProfilesEnterprisePolicy(): Root.Runtime.GdpProfilesEnterprisePolicyValue;
export declare function isBadgesEnabled(): boolean;
export declare function isStarterBadgeEnabled(): boolean;
