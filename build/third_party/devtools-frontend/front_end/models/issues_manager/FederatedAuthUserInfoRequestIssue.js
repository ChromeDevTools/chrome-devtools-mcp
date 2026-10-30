// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description Title for Federated Credential Management User Info API specification URL link.
     */
    fedCmUserInfo: 'Federated Credential Management User Info API',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/FederatedAuthUserInfoRequestIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class FederatedAuthUserInfoRequestIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super({
            code: "FederatedAuthUserInfoRequestIssue" /* Protocol.Audits.InspectorIssueCode.FederatedAuthUserInfoRequestIssue */,
            umaCode: [
                "FederatedAuthUserInfoRequestIssue" /* Protocol.Audits.InspectorIssueCode.FederatedAuthUserInfoRequestIssue */,
                issueDetails.federatedAuthUserInfoRequestIssueReason,
            ].join('::'),
        }, issueDetails, issuesModel);
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        const description = issueDescriptions.get(this.details().federatedAuthUserInfoRequestIssueReason);
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
        const details = inspectorIssue.details.federatedAuthUserInfoRequestIssueDetails;
        if (!details) {
            console.warn('Federated auth user info request issue without details received.');
            return [];
        }
        return [new FederatedAuthUserInfoRequestIssue(details, issuesModel)];
    }
}
const issueDescriptions = new Map([
    [
        "NotSameOrigin" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.NotSameOrigin */,
        {
            file: 'federatedAuthUserInfoRequestNotSameOrigin.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
    [
        "NotIframe" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.NotIframe */,
        {
            file: 'federatedAuthUserInfoRequestNotIframe.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
    [
        "NotPotentiallyTrustworthy" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.NotPotentiallyTrustworthy */,
        {
            file: 'federatedAuthUserInfoRequestNotPotentiallyTrustworthy.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
    [
        "NoApiPermission" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.NoAPIPermission */,
        {
            file: 'federatedAuthUserInfoRequestNoApiPermission.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
    [
        "NotSignedInWithIdp" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.NotSignedInWithIdp */,
        {
            file: 'federatedAuthUserInfoRequestNotSignedInWithIdp.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
    [
        "NoAccountSharingPermission" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.NoAccountSharingPermission */,
        {
            file: 'federatedAuthUserInfoRequestNoAccountSharingPermission.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
    [
        "InvalidConfigOrWellKnown" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.InvalidConfigOrWellKnown */,
        {
            file: 'federatedAuthUserInfoRequestInvalidConfigOrWellKnown.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
    [
        "InvalidAccountsResponse" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.InvalidAccountsResponse */,
        {
            file: 'federatedAuthUserInfoRequestInvalidAccountsResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
    [
        "NoReturningUserFromFetchedAccounts" /* Protocol.Audits.FederatedAuthUserInfoRequestIssueReason.NoReturningUserFromFetchedAccounts */,
        {
            file: 'federatedAuthUserInfoRequestNoReturningUserFromFetchedAccounts.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCmUserInfo),
                }],
        },
    ],
]);
//# sourceMappingURL=FederatedAuthUserInfoRequestIssue.js.map