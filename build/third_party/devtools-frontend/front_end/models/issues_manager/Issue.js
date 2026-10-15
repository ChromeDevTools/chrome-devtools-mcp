// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
const UIStrings = {
    /**
     * @description The kind of an issue (plural, issues are categorized into kinds).
     */
    improvements: 'Improvements',
    /**
     * @description The kind of an issue (plural, issues are categorized into kinds).
     */
    pageErrors: 'Page errors',
    /**
     * @description The kind of an issue (plural, issues are categorized into kinds).
     */
    breakingChanges: 'Breaking changes',
    /**
     * @description A description for a kind of issue we display in the Issues tab.
     */
    pageErrorIssue: 'A page error issue: the page isn’t working correctly',
    /**
     * @description A description for a kind of issue we display in the Issues tab.
     */
    breakingChangeIssue: 'A breaking change issue: the page may stop working in an upcoming version of Chrome',
    /**
     * @description A description for a kind of issue we display in the Issues tab.
     */
    improvementIssue: 'An improvement issue: there is an opportunity to improve the page',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/Issue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export function getIssueKindName(issueKind) {
    switch (issueKind) {
        case "BreakingChange" /* IssueKind.BREAKING_CHANGE */:
            return i18nString(UIStrings.breakingChanges);
        case "Improvement" /* IssueKind.IMPROVEMENT */:
            return i18nString(UIStrings.improvements);
        case "PageError" /* IssueKind.PAGE_ERROR */:
            return i18nString(UIStrings.pageErrors);
    }
}
export function getIssueKindDescription(issueKind) {
    switch (issueKind) {
        case "PageError" /* IssueKind.PAGE_ERROR */:
            return i18nString(UIStrings.pageErrorIssue);
        case "BreakingChange" /* IssueKind.BREAKING_CHANGE */:
            return i18nString(UIStrings.breakingChangeIssue);
        case "Improvement" /* IssueKind.IMPROVEMENT */:
            return i18nString(UIStrings.improvementIssue);
    }
}
/**
 * Union two issue kinds for issue aggregation. The idea is to show the most
 * important kind on aggregated issues that union issues of different kinds.
 */
export function unionIssueKind(a, b) {
    if (a === "PageError" /* IssueKind.PAGE_ERROR */ || b === "PageError" /* IssueKind.PAGE_ERROR */) {
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    if (a === "BreakingChange" /* IssueKind.BREAKING_CHANGE */ || b === "BreakingChange" /* IssueKind.BREAKING_CHANGE */) {
        return "BreakingChange" /* IssueKind.BREAKING_CHANGE */;
    }
    return "Improvement" /* IssueKind.IMPROVEMENT */;
}
export function getShowThirdPartyIssuesSetting(settings) {
    return settings.createSetting('show-third-party-issues', true);
}
export class Issue {
    #issueCode;
    #issuesModel;
    issueId = undefined;
    #issueDetails;
    #hidden;
    constructor(code, issueDetails, issuesModel = null, issueId) {
        this.#issueCode = typeof code === 'object' ? code.code : code;
        this.#issueDetails = issueDetails;
        this.#issuesModel = issuesModel;
        this.issueId = issueId;
        Host.userMetrics.issueCreated(typeof code === 'string' ? code : code.umaCode);
        this.#hidden = false;
    }
    code() {
        return this.#issueCode;
    }
    details() {
        return this.#issueDetails;
    }
    getBlockedByResponseDetails() {
        return [];
    }
    cookies() {
        return [];
    }
    rawCookieLines() {
        return [];
    }
    elements() {
        return [];
    }
    requests() {
        return [];
    }
    sources() {
        return [];
    }
    trackingSites() {
        return [];
    }
    isAssociatedWithRequestId(requestId) {
        for (const request of this.requests()) {
            if (request.requestId === requestId) {
                return true;
            }
        }
        return false;
    }
    /**
     * The model might be unavailable or belong to a target that has already been disposed.
     */
    model() {
        return this.#issuesModel;
    }
    isCausedByThirdParty() {
        return false;
    }
    getIssueId() {
        return this.issueId;
    }
    isHidden() {
        return this.#hidden;
    }
    setHidden(hidden) {
        this.#hidden = hidden;
    }
    maybeCreateConsoleMessage() {
        return;
    }
}
export function toZeroBasedLocation(location) {
    if (!location) {
        return undefined;
    }
    return {
        url: location.url,
        scriptId: location.scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber === 0 ? undefined : location.columnNumber - 1,
    };
}
//# sourceMappingURL=Issue.js.map