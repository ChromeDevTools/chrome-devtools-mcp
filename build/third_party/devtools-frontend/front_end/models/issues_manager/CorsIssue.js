// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Label for the link for CORS Local Network Access issues.
     */
    corsLocalNetworkAccess: 'Local Network Access',
    /**
     * @description Label for the link for CORS network issues.
     */
    CORS: 'Cross-Origin Resource Sharing (CORS)',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/CorsIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
function getIssueCode(details) {
    switch (details.corsErrorStatus.corsError) {
        case "InvalidAllowMethodsPreflightResponse" /* Protocol.Network.CorsError.InvalidAllowMethodsPreflightResponse */:
        case "InvalidAllowHeadersPreflightResponse" /* Protocol.Network.CorsError.InvalidAllowHeadersPreflightResponse */:
        case "PreflightMissingAllowOriginHeader" /* Protocol.Network.CorsError.PreflightMissingAllowOriginHeader */:
        case "PreflightMultipleAllowOriginValues" /* Protocol.Network.CorsError.PreflightMultipleAllowOriginValues */:
        case "PreflightInvalidAllowOriginValue" /* Protocol.Network.CorsError.PreflightInvalidAllowOriginValue */:
        case "MissingAllowOriginHeader" /* Protocol.Network.CorsError.MissingAllowOriginHeader */:
        case "MultipleAllowOriginValues" /* Protocol.Network.CorsError.MultipleAllowOriginValues */:
        case "InvalidAllowOriginValue" /* Protocol.Network.CorsError.InvalidAllowOriginValue */:
            return "CorsIssue::InvalidHeaders" /* IssueCode.INVALID_HEADER_VALUES */;
        case "PreflightWildcardOriginNotAllowed" /* Protocol.Network.CorsError.PreflightWildcardOriginNotAllowed */:
        case "WildcardOriginNotAllowed" /* Protocol.Network.CorsError.WildcardOriginNotAllowed */:
            return "CorsIssue::WildcardOriginWithCredentials" /* IssueCode.WILDCARD_ORIGN_NOT_ALLOWED */;
        case "PreflightInvalidStatus" /* Protocol.Network.CorsError.PreflightInvalidStatus */:
        case "PreflightDisallowedRedirect" /* Protocol.Network.CorsError.PreflightDisallowedRedirect */:
        case "InvalidResponse" /* Protocol.Network.CorsError.InvalidResponse */:
            return "CorsIssue::PreflightResponseInvalid" /* IssueCode.PREFLIGHT_RESPONSE_INVALID */;
        case "AllowOriginMismatch" /* Protocol.Network.CorsError.AllowOriginMismatch */:
        case "PreflightAllowOriginMismatch" /* Protocol.Network.CorsError.PreflightAllowOriginMismatch */:
            return "CorsIssue::OriginMismatch" /* IssueCode.ORIGIN_MISMATCH */;
        case "InvalidAllowCredentials" /* Protocol.Network.CorsError.InvalidAllowCredentials */:
        case "PreflightInvalidAllowCredentials" /* Protocol.Network.CorsError.PreflightInvalidAllowCredentials */:
            return "CorsIssue::AllowCredentialsRequired" /* IssueCode.ALLOW_CREDENTIALS_REQUIRED */;
        case "MethodDisallowedByPreflightResponse" /* Protocol.Network.CorsError.MethodDisallowedByPreflightResponse */:
            return "CorsIssue::MethodDisallowedByPreflightResponse" /* IssueCode.METHOD_DISALLOWED_BY_PREFLIGHT_RESPONSE */;
        case "HeaderDisallowedByPreflightResponse" /* Protocol.Network.CorsError.HeaderDisallowedByPreflightResponse */:
            return "CorsIssue::HeaderDisallowedByPreflightResponse" /* IssueCode.HEADER_DISALLOWED_BY_PREFLIGHT_RESPONSE */;
        case "RedirectContainsCredentials" /* Protocol.Network.CorsError.RedirectContainsCredentials */:
            return "CorsIssue::RedirectContainsCredentials" /* IssueCode.REDIRECT_CONTAINS_CREDENTIALS */;
        case "DisallowedByMode" /* Protocol.Network.CorsError.DisallowedByMode */:
            return "CorsIssue::DisallowedByMode" /* IssueCode.DISALLOWED_BY_MODE */;
        case "CorsDisabledScheme" /* Protocol.Network.CorsError.CorsDisabledScheme */:
            return "CorsIssue::CorsDisabledScheme" /* IssueCode.CORS_DISABLED_SCHEME */;
        case "PreflightMissingAllowExternal" /* Protocol.Network.CorsError.PreflightMissingAllowExternal */:
            return "CorsIssue::PreflightMissingAllowExternal" /* IssueCode.PREFLIGHT_MISSING_ALLOW_EXTERNAL */;
        case "PreflightInvalidAllowExternal" /* Protocol.Network.CorsError.PreflightInvalidAllowExternal */:
            return "CorsIssue::PreflightInvalidAllowExternal" /* IssueCode.PREFLIGHT_INVALID_ALLOW_EXTERNAL */;
        case "InsecureLocalNetwork" /* Protocol.Network.CorsError.InsecureLocalNetwork */:
            return "CorsIssue::InsecureLocalNetwork" /* IssueCode.INSECURE_LOCAL_NETWORK */;
        case "NoCorsRedirectModeNotFollow" /* Protocol.Network.CorsError.NoCorsRedirectModeNotFollow */:
            return "CorsIssue::NoCorsRedirectModeNotFollow" /* IssueCode.NO_CORS_REDIRECT_MODE_NOT_FOLLOW */;
        case "InvalidLocalNetworkAccess" /* Protocol.Network.CorsError.InvalidLocalNetworkAccess */:
            return "CorsIssue::InvalidLocalNetworkAccess" /* IssueCode.INVALID_LOCAL_NETWORK_ACCESS */;
        case "LocalNetworkAccessPermissionDenied" /* Protocol.Network.CorsError.LocalNetworkAccessPermissionDenied */:
            return "CorsIssue::LocalNetworkAccessPermissionDenied" /* IssueCode.LOCAL_NETWORK_ACCESS_PERMISSION_DENIED */;
    }
}
export class CorsIssue extends Issue {
    constructor(issueDetails, issuesModel, issueId) {
        super(getIssueCode(issueDetails), issueDetails, issuesModel, issueId);
    }
    getCategory() {
        return "Cors" /* IssueCategory.CORS */;
    }
    getDescription() {
        switch (getIssueCode(this.details())) {
            case "CorsIssue::InvalidHeaders" /* IssueCode.INVALID_HEADER_VALUES */:
                return {
                    file: 'corsInvalidHeaderValues.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::WildcardOriginWithCredentials" /* IssueCode.WILDCARD_ORIGN_NOT_ALLOWED */:
                return {
                    file: 'corsWildcardOriginNotAllowed.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::PreflightResponseInvalid" /* IssueCode.PREFLIGHT_RESPONSE_INVALID */:
                return {
                    file: 'corsPreflightResponseInvalid.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::OriginMismatch" /* IssueCode.ORIGIN_MISMATCH */:
                return {
                    file: 'corsOriginMismatch.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::AllowCredentialsRequired" /* IssueCode.ALLOW_CREDENTIALS_REQUIRED */:
                return {
                    file: 'corsAllowCredentialsRequired.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::MethodDisallowedByPreflightResponse" /* IssueCode.METHOD_DISALLOWED_BY_PREFLIGHT_RESPONSE */:
                return {
                    file: 'corsMethodDisallowedByPreflightResponse.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::HeaderDisallowedByPreflightResponse" /* IssueCode.HEADER_DISALLOWED_BY_PREFLIGHT_RESPONSE */:
                return {
                    file: 'corsHeaderDisallowedByPreflightResponse.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::RedirectContainsCredentials" /* IssueCode.REDIRECT_CONTAINS_CREDENTIALS */:
                return {
                    file: 'corsRedirectContainsCredentials.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::DisallowedByMode" /* IssueCode.DISALLOWED_BY_MODE */:
                return {
                    file: 'corsDisallowedByMode.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::CorsDisabledScheme" /* IssueCode.CORS_DISABLED_SCHEME */:
                return {
                    file: 'corsDisabledScheme.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::NoCorsRedirectModeNotFollow" /* IssueCode.NO_CORS_REDIRECT_MODE_NOT_FOLLOW */:
                return {
                    file: 'corsNoCorsRedirectModeNotFollow.md',
                    links: [{
                            link: 'https://web.dev/cross-origin-resource-sharing',
                            linkTitle: i18nString(UIStrings.CORS),
                        }],
                };
            case "CorsIssue::InsecureLocalNetwork" /* IssueCode.INSECURE_LOCAL_NETWORK */:
            case "CorsIssue::LocalNetworkAccessPermissionDenied" /* IssueCode.LOCAL_NETWORK_ACCESS_PERMISSION_DENIED */:
                return {
                    file: 'corsLocalNetworkAccessPermissionDenied.md',
                    links: [{
                            link: 'https://developer.chrome.com/blog/local-network-access',
                            linkTitle: i18nString(UIStrings.corsLocalNetworkAccess),
                        }],
                };
            case "CorsIssue::PreflightMissingAllowExternal" /* IssueCode.PREFLIGHT_MISSING_ALLOW_EXTERNAL */:
            case "CorsIssue::PreflightInvalidAllowExternal" /* IssueCode.PREFLIGHT_INVALID_ALLOW_EXTERNAL */:
            case "CorsIssue::InvalidLocalNetworkAccess" /* IssueCode.INVALID_LOCAL_NETWORK_ACCESS */:
                return null;
        }
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    getKind() {
        if (this.details().isWarning &&
            this.details().corsErrorStatus.corsError === "InsecureLocalNetwork" /* Protocol.Network.CorsError.InsecureLocalNetwork */) {
            return "BreakingChange" /* IssueKind.BREAKING_CHANGE */;
        }
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const corsIssueDetails = inspectorIssue.details.corsIssueDetails;
        if (!corsIssueDetails) {
            console.warn('Cors issue without details received.');
            return [];
        }
        return [new CorsIssue(corsIssueDetails, issuesModel, inspectorIssue.issueId)];
    }
}
//# sourceMappingURL=CorsIssue.js.map