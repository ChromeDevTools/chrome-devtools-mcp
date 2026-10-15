// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description Title for Federated Credential Management API specification URL link.
     */
    fedCm: 'Federated Credential Management API',
    /**
     * @description Title for Connection Allowlists API specification URL link.
     */
    connectionAllowlist: 'Connection Allowlists API',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/FederatedAuthRequestIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class FederatedAuthRequestIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super({
            code: "FederatedAuthRequestIssue" /* Protocol.Audits.InspectorIssueCode.FederatedAuthRequestIssue */,
            umaCode: [
                "FederatedAuthRequestIssue" /* Protocol.Audits.InspectorIssueCode.FederatedAuthRequestIssue */,
                issueDetails.federatedAuthRequestIssueReason,
            ].join('::'),
        }, issueDetails, issuesModel);
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        const description = issueDescriptions.get(this.details().federatedAuthRequestIssueReason);
        if (!description) {
            return null;
        }
        return resolveLazyDescription(description);
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    getKind() {
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.federatedAuthRequestIssueDetails;
        if (!details) {
            console.warn('Federated auth request issue without details received.');
            return [];
        }
        return [new FederatedAuthRequestIssue(details, issuesModel)];
    }
}
const issueDescriptions = new Map([
    [
        "TooManyRequests" /* Protocol.Audits.FederatedAuthRequestIssueReason.TooManyRequests */,
        {
            file: 'federatedAuthRequestTooManyRequests.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "WellKnownBlockedByConnectionAllowlist" /* Protocol.Audits.FederatedAuthRequestIssueReason.WellKnownBlockedByConnectionAllowlist */,
        {
            file: 'federatedAuthRequestWellKnownBlockedByConnectionAllowlist.md',
            links: [{
                    // TODO(crbug.com/543660447): Update this link once connection allowlist is moved out of WICG repo.
                    link: 'https://github.com/WICG/connection-allowlists',
                    linkTitle: i18nLazyString(UIStrings.connectionAllowlist),
                }],
        },
    ],
    [
        "ConfigHttpNotFound" /* Protocol.Audits.FederatedAuthRequestIssueReason.ConfigHttpNotFound */,
        {
            file: 'federatedAuthRequestManifestHttpNotFound.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ConfigNoResponse" /* Protocol.Audits.FederatedAuthRequestIssueReason.ConfigNoResponse */,
        {
            file: 'federatedAuthRequestManifestNoResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ConfigBlockedByConnectionAllowlist" /* Protocol.Audits.FederatedAuthRequestIssueReason.ConfigBlockedByConnectionAllowlist */,
        {
            file: 'federatedAuthRequestConfigBlockedByConnectionAllowlist.md',
            links: [{
                    // TODO(crbug.com/543660447): Update this link once connection allowlist is moved out of WICG repo.
                    link: 'https://github.com/WICG/connection-allowlists',
                    linkTitle: i18nLazyString(UIStrings.connectionAllowlist),
                }],
        },
    ],
    [
        "ConfigInvalidResponse" /* Protocol.Audits.FederatedAuthRequestIssueReason.ConfigInvalidResponse */,
        {
            file: 'federatedAuthRequestManifestInvalidResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ErrorFetchingSignin" /* Protocol.Audits.FederatedAuthRequestIssueReason.ErrorFetchingSignin */,
        {
            file: 'federatedAuthRequestErrorFetchingSignin.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "InvalidSigninResponse" /* Protocol.Audits.FederatedAuthRequestIssueReason.InvalidSigninResponse */,
        {
            file: 'federatedAuthRequestInvalidSigninResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "AccountsHttpNotFound" /* Protocol.Audits.FederatedAuthRequestIssueReason.AccountsHttpNotFound */,
        {
            file: 'federatedAuthRequestAccountsHttpNotFound.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "AccountsNoResponse" /* Protocol.Audits.FederatedAuthRequestIssueReason.AccountsNoResponse */,
        {
            file: 'federatedAuthRequestAccountsNoResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "AccountsBlockedByConnectionAllowlist" /* Protocol.Audits.FederatedAuthRequestIssueReason.AccountsBlockedByConnectionAllowlist */,
        {
            file: 'federatedAuthRequestAccountsBlockedByConnectionAllowlist.md',
            links: [{
                    // TODO(crbug.com/543660447): Update this link once connection allowlist is moved out of WICG repo.
                    link: 'https://github.com/WICG/connection-allowlists',
                    linkTitle: i18nLazyString(UIStrings.connectionAllowlist),
                }],
        },
    ],
    [
        "AccountsInvalidResponse" /* Protocol.Audits.FederatedAuthRequestIssueReason.AccountsInvalidResponse */,
        {
            file: 'federatedAuthRequestAccountsInvalidResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "IdTokenHttpNotFound" /* Protocol.Audits.FederatedAuthRequestIssueReason.IdTokenHttpNotFound */,
        {
            file: 'federatedAuthRequestIdTokenHttpNotFound.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "IdTokenNoResponse" /* Protocol.Audits.FederatedAuthRequestIssueReason.IdTokenNoResponse */,
        {
            file: 'federatedAuthRequestIdTokenNoResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "IdTokenBlockedByConnectionAllowlist" /* Protocol.Audits.FederatedAuthRequestIssueReason.IdTokenBlockedByConnectionAllowlist */,
        {
            file: 'federatedAuthRequestIdTokenBlockedByConnectionAllowlist.md',
            links: [{
                    // TODO(crbug.com/543660447): Update this link once connection allowlist is moved out of WICG repo.
                    link: 'https://github.com/WICG/connection-allowlists',
                    linkTitle: i18nLazyString(UIStrings.connectionAllowlist),
                }],
        },
    ],
    [
        "IdTokenInvalidResponse" /* Protocol.Audits.FederatedAuthRequestIssueReason.IdTokenInvalidResponse */,
        {
            file: 'federatedAuthRequestIdTokenInvalidResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "IdTokenInvalidRequest" /* Protocol.Audits.FederatedAuthRequestIssueReason.IdTokenInvalidRequest */,
        {
            file: 'federatedAuthRequestIdTokenInvalidRequest.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ErrorIdToken" /* Protocol.Audits.FederatedAuthRequestIssueReason.ErrorIdToken */,
        {
            file: 'federatedAuthRequestErrorIdToken.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "Canceled" /* Protocol.Audits.FederatedAuthRequestIssueReason.Canceled */,
        {
            file: 'federatedAuthRequestCanceled.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
]);
//# sourceMappingURL=FederatedAuthRequestIssue.js.map