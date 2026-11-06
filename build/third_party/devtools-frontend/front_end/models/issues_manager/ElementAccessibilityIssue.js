// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
export class ElementAccessibilityIssue extends Issue {
    constructor(issueDetails, issuesModel, issueId) {
        const issueCode = [
            "ElementAccessibilityIssue" /* Protocol.Audits.InspectorIssueCode.ElementAccessibilityIssue */,
            issueDetails.elementAccessibilityIssueReason,
        ].join('::');
        super(issueCode, issueDetails, issuesModel, issueId);
    }
    elements() {
        const details = this.details();
        if (details.nodeId) {
            return [{
                    backendNodeId: details.nodeId,
                    nodeName: '',
                    target: this.model()?.target() ?? null,
                }];
        }
        return [];
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    getDescription() {
        if (this.isInteractiveContentAttributesSelectDescendantIssue()) {
            return {
                file: 'selectElementAccessibilityInteractiveContentAttributesSelectDescendant.md',
                links: [],
            };
        }
        const description = issueDescriptions.get(this.details().elementAccessibilityIssueReason);
        if (!description) {
            return null;
        }
        return resolveLazyDescription(description);
    }
    getKind() {
        return "PageError" /* IssueKind.PAGE_ERROR */;
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    isInteractiveContentAttributesSelectDescendantIssue() {
        return this.details().hasDisallowedAttributes &&
            (this.details().elementAccessibilityIssueReason !== "InteractiveContentOptionChild" /* Protocol.Audits.ElementAccessibilityIssueReason.InteractiveContentOptionChild */ &&
                this.details().elementAccessibilityIssueReason !== "InteractiveContentSummaryDescendant" /* Protocol.Audits.ElementAccessibilityIssueReason.InteractiveContentSummaryDescendant */);
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const elementAccessibilityIssueDetails = inspectorIssue.details.elementAccessibilityIssueDetails;
        if (!elementAccessibilityIssueDetails) {
            console.warn('Element Accessibility issue without details received.');
            return [];
        }
        return [new ElementAccessibilityIssue(elementAccessibilityIssueDetails, issuesModel, inspectorIssue.issueId)];
    }
}
const issueDescriptions = new Map([
    [
        "DisallowedSelectChild" /* Protocol.Audits.ElementAccessibilityIssueReason.DisallowedSelectChild */,
        {
            file: 'selectElementAccessibilityDisallowedSelectChild.md',
            links: [],
        },
    ],
    [
        "DisallowedOptGroupChild" /* Protocol.Audits.ElementAccessibilityIssueReason.DisallowedOptGroupChild */,
        {
            file: 'selectElementAccessibilityDisallowedOptGroupChild.md',
            links: [],
        },
    ],
    [
        "NonPhrasingContentOptionChild" /* Protocol.Audits.ElementAccessibilityIssueReason.NonPhrasingContentOptionChild */,
        {
            file: 'selectElementAccessibilityNonPhrasingContentOptionChild.md',
            links: [],
        },
    ],
    [
        "InteractiveContentOptionChild" /* Protocol.Audits.ElementAccessibilityIssueReason.InteractiveContentOptionChild */,
        {
            file: 'selectElementAccessibilityInteractiveContentOptionChild.md',
            links: [],
        },
    ],
    [
        "InteractiveContentLegendChild" /* Protocol.Audits.ElementAccessibilityIssueReason.InteractiveContentLegendChild */,
        {
            file: 'selectElementAccessibilityInteractiveContentLegendChild.md',
            links: [],
        },
    ],
    [
        "InteractiveContentSummaryDescendant" /* Protocol.Audits.ElementAccessibilityIssueReason.InteractiveContentSummaryDescendant */,
        {
            file: 'summaryElementAccessibilityInteractiveContentSummaryDescendant.md',
            links: [],
        },
    ],
]);
//# sourceMappingURL=ElementAccessibilityIssue.js.map