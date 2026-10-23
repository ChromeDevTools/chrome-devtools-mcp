// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description Title for CSP URL link.
     */
    contentSecurityPolicySource: 'Content Security Policy - Source allowlists',
    /**
     * @description Title for CSP inline issue link.
     */
    contentSecurityPolicyInlineCode: 'Content Security Policy - Inline code',
    /**
     * @description Title for the CSP eval link.
     */
    contentSecurityPolicyEval: 'Content Security Policy - Eval',
    /**
     * @description Title for Trusted Types policy violation issue link (https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API).
     */
    trustedTypesFixViolations: 'Trusted Types - Fix violations',
    /**
     * @description Title for Trusted Types policy violation issue link (https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API).
     */
    trustedTypesPolicyViolation: 'Trusted Types - Policy violation',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/ContentSecurityPolicyIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class ContentSecurityPolicyIssue extends Issue {
    constructor(issueDetails, issuesModel, issueId) {
        const issueCode = [
            "ContentSecurityPolicyIssue" /* Protocol.Audits.InspectorIssueCode.ContentSecurityPolicyIssue */,
            issueDetails.contentSecurityPolicyViolationType,
        ].join('::');
        super(issueCode, issueDetails, issuesModel, issueId);
    }
    getCategory() {
        return "ContentSecurityPolicy" /* IssueCategory.CONTENT_SECURITY_POLICY */;
    }
    primaryKey() {
        return JSON.stringify(this.details(), [
            'blockedURL',
            'contentSecurityPolicyViolationType',
            'violatedDirective',
            'isReportOnly',
            'sourceCodeLocation',
            'url',
            'lineNumber',
            'columnNumber',
            'violatingNodeId',
        ]);
    }
    getDescription() {
        const description = issueDescriptions.get(this.details().contentSecurityPolicyViolationType);
        if (!description) {
            return null;
        }
        return resolveLazyDescription(description);
    }
    getKind() {
        if (this.details().isReportOnly) {
            return "Improvement" /* IssueKind.IMPROVEMENT */;
        }
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const cspDetails = inspectorIssue.details.contentSecurityPolicyIssueDetails;
        if (!cspDetails) {
            console.warn('Content security policy issue without details received.');
            return [];
        }
        return [new ContentSecurityPolicyIssue(cspDetails, issuesModel, inspectorIssue.issueId)];
    }
}
const cspURLViolation = {
    file: 'cspURLViolation.md',
    links: [{
            link: 'https://developers.google.com/web/fundamentals/security/csp#source_allowlists',
            linkTitle: i18nLazyString(UIStrings.contentSecurityPolicySource),
        }],
};
const cspInlineViolation = {
    file: 'cspInlineViolation.md',
    links: [{
            link: 'https://developers.google.com/web/fundamentals/security/csp#inline_code_is_considered_harmful',
            linkTitle: i18nLazyString(UIStrings.contentSecurityPolicyInlineCode),
        }],
};
const cspEvalViolation = {
    file: 'cspEvalViolation.md',
    links: [{
            link: 'https://developers.google.com/web/fundamentals/security/csp#eval_too',
            linkTitle: i18nLazyString(UIStrings.contentSecurityPolicyEval),
        }],
};
const cspTrustedTypesSinkViolation = {
    file: 'cspTrustedTypesSinkViolation.md',
    links: [{
            link: 'https://web.dev/trusted-types/#fix-the-violations',
            linkTitle: i18nLazyString(UIStrings.trustedTypesFixViolations),
        }],
};
const cspTrustedTypesPolicyViolation = {
    file: 'cspTrustedTypesPolicyViolation.md',
    links: [{ link: 'https://web.dev/trusted-types/', linkTitle: i18nLazyString(UIStrings.trustedTypesPolicyViolation) }],
};
export const urlViolationCode = [
    "ContentSecurityPolicyIssue" /* Protocol.Audits.InspectorIssueCode.ContentSecurityPolicyIssue */,
    "kURLViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KURLViolation */,
].join('::');
export const inlineViolationCode = [
    "ContentSecurityPolicyIssue" /* Protocol.Audits.InspectorIssueCode.ContentSecurityPolicyIssue */,
    "kInlineViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KInlineViolation */,
].join('::');
export const evalViolationCode = [
    "ContentSecurityPolicyIssue" /* Protocol.Audits.InspectorIssueCode.ContentSecurityPolicyIssue */,
    "kEvalViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KEvalViolation */,
].join('::');
export const trustedTypesSinkViolationCode = [
    "ContentSecurityPolicyIssue" /* Protocol.Audits.InspectorIssueCode.ContentSecurityPolicyIssue */,
    "kTrustedTypesSinkViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KTrustedTypesSinkViolation */,
].join('::');
export const trustedTypesPolicyViolationCode = [
    "ContentSecurityPolicyIssue" /* Protocol.Audits.InspectorIssueCode.ContentSecurityPolicyIssue */,
    "kTrustedTypesPolicyViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KTrustedTypesPolicyViolation */,
].join('::');
const issueDescriptions = new Map([
    ["kURLViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KURLViolation */, cspURLViolation],
    ["kInlineViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KInlineViolation */, cspInlineViolation],
    ["kEvalViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KEvalViolation */, cspEvalViolation],
    ["kTrustedTypesSinkViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KTrustedTypesSinkViolation */, cspTrustedTypesSinkViolation],
    ["kTrustedTypesPolicyViolation" /* Protocol.Audits.ContentSecurityPolicyViolationType.KTrustedTypesPolicyViolation */, cspTrustedTypesPolicyViolation],
]);
//# sourceMappingURL=ContentSecurityPolicyIssue.js.map