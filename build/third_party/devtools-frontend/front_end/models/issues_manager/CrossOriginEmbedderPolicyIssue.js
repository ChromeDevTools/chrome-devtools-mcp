// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description Link text for a link to external documentation.
     */
    coopAndCoep: 'COOP and COEP',
    /**
     * @description Title for an external link to more information in the Issues view.
     */
    samesiteAndSameorigin: 'Same-Site and Same-Origin',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/CrossOriginEmbedderPolicyIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export function isCrossOriginEmbedderPolicyIssue(reason) {
    switch (reason) {
        case "CoepFrameResourceNeedsCoepHeader" /* Protocol.Audits.BlockedByResponseReason.CoepFrameResourceNeedsCoepHeader */:
            return true;
        case "CoopSandboxedIFrameCannotNavigateToCoopPage" /* Protocol.Audits.BlockedByResponseReason.CoopSandboxedIFrameCannotNavigateToCoopPage */:
            return true;
        case "CorpNotSameOrigin" /* Protocol.Audits.BlockedByResponseReason.CorpNotSameOrigin */:
            return true;
        case "CorpNotSameOriginAfterDefaultedToSameOriginByCoep" /* Protocol.Audits.BlockedByResponseReason.CorpNotSameOriginAfterDefaultedToSameOriginByCoep */:
            return true;
        case "CorpNotSameSite" /* Protocol.Audits.BlockedByResponseReason.CorpNotSameSite */:
            return true;
    }
    return false;
}
export class CrossOriginEmbedderPolicyIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super(`CrossOriginEmbedderPolicyIssue::${issueDetails.reason}`, issueDetails, issuesModel);
    }
    primaryKey() {
        return `${this.code()}-(${this.details().request.requestId})`;
    }
    getBlockedByResponseDetails() {
        return [this.details()];
    }
    requests() {
        return [this.details().request];
    }
    getCategory() {
        return "CrossOriginEmbedderPolicy" /* IssueCategory.CROSS_ORIGIN_EMBEDDER_POLICY */;
    }
    getDescription() {
        const description = issueDescriptions.get(this.code());
        if (!description) {
            return null;
        }
        return resolveLazyDescription(description);
    }
    getKind() {
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
}
const issueDescriptions = new Map([
    [
        'CrossOriginEmbedderPolicyIssue::CorpNotSameOriginAfterDefaultedToSameOriginByCoep',
        {
            file: 'CoepCorpNotSameOriginAfterDefaultedToSameOriginByCoep.md',
            links: [
                { link: 'https://web.dev/coop-coep/', linkTitle: i18nLazyString(UIStrings.coopAndCoep) },
                { link: 'https://web.dev/same-site-same-origin/', linkTitle: i18nLazyString(UIStrings.samesiteAndSameorigin) },
            ],
        },
    ],
    [
        'CrossOriginEmbedderPolicyIssue::CoepFrameResourceNeedsCoepHeader',
        {
            file: 'CoepFrameResourceNeedsCoepHeader.md',
            links: [
                { link: 'https://web.dev/coop-coep/', linkTitle: i18nLazyString(UIStrings.coopAndCoep) },
            ],
        },
    ],
    [
        'CrossOriginEmbedderPolicyIssue::CoopSandboxedIframeCannotNavigateToCoopPage',
        {
            file: 'CoepCoopSandboxedIframeCannotNavigateToCoopPage.md',
            links: [
                { link: 'https://web.dev/coop-coep/', linkTitle: i18nLazyString(UIStrings.coopAndCoep) },
            ],
        },
    ],
    [
        'CrossOriginEmbedderPolicyIssue::CorpNotSameSite',
        {
            file: 'CoepCorpNotSameSite.md',
            links: [
                { link: 'https://web.dev/coop-coep/', linkTitle: i18nLazyString(UIStrings.coopAndCoep) },
                { link: 'https://web.dev/same-site-same-origin/', linkTitle: i18nLazyString(UIStrings.samesiteAndSameorigin) },
            ],
        },
    ],
    [
        'CrossOriginEmbedderPolicyIssue::CorpNotSameOrigin',
        {
            file: 'CoepCorpNotSameOrigin.md',
            links: [
                { link: 'https://web.dev/coop-coep/', linkTitle: i18nLazyString(UIStrings.coopAndCoep) },
                { link: 'https://web.dev/same-site-same-origin/', linkTitle: i18nLazyString(UIStrings.samesiteAndSameorigin) },
            ],
        },
    ],
]);
//# sourceMappingURL=CrossOriginEmbedderPolicyIssue.js.map