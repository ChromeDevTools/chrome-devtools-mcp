// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Issue } from './Issue.js';
export class PermissionElementIssue extends Issue {
    #issueDetails;
    constructor(issueDetails, issuesModel) {
        const issueCode = [
            "PermissionElementIssue" /* Protocol.Audits.InspectorIssueCode.PermissionElementIssue */,
            issueDetails.issueType,
        ].join('::');
        super(issueCode, issueDetails, issuesModel);
        this.#issueDetails = issueDetails;
    }
    getCategory() {
        return "PermissionElement" /* IssueCategory.PERMISSION_ELEMENT */;
    }
    getDescription() {
        const issueType = this.#issueDetails.issueType;
        switch (issueType) {
            case "InvalidType" /* Protocol.Audits.PermissionElementIssueType.InvalidType */:
                return {
                    file: 'permissionElementInvalidType.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "FencedFrameDisallowed" /* Protocol.Audits.PermissionElementIssueType.FencedFrameDisallowed */:
                return {
                    file: 'permissionElementFencedFrameDisallowed.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "CspFrameAncestorsMissing" /* Protocol.Audits.PermissionElementIssueType.CspFrameAncestorsMissing */:
                return {
                    file: 'permissionElementCspFrameAncestorsMissing.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "PermissionsPolicyBlocked" /* Protocol.Audits.PermissionElementIssueType.PermissionsPolicyBlocked */:
                return {
                    file: 'permissionElementPermissionsPolicyBlocked.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                        ['PLACEHOLDER_PermissionName', this.#issueDetails.permissionName || ''],
                    ]),
                    links: [],
                };
            case "PaddingRightUnsupported" /* Protocol.Audits.PermissionElementIssueType.PaddingRightUnsupported */:
                return {
                    file: 'permissionElementPaddingRightUnsupported.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "PaddingBottomUnsupported" /* Protocol.Audits.PermissionElementIssueType.PaddingBottomUnsupported */:
                return {
                    file: 'permissionElementPaddingBottomUnsupported.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "InsetBoxShadowUnsupported" /* Protocol.Audits.PermissionElementIssueType.InsetBoxShadowUnsupported */:
                return {
                    file: 'permissionElementInsetBoxShadowUnsupported.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "RequestInProgress" /* Protocol.Audits.PermissionElementIssueType.RequestInProgress */:
                return {
                    file: 'permissionElementRequestInProgress.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "UntrustedEvent" /* Protocol.Audits.PermissionElementIssueType.UntrustedEvent */:
                return {
                    file: 'permissionElementUntrustedEvent.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "RegistrationFailed" /* Protocol.Audits.PermissionElementIssueType.RegistrationFailed */:
                return {
                    file: 'permissionElementRegistrationFailed.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "TypeNotSupported" /* Protocol.Audits.PermissionElementIssueType.TypeNotSupported */:
                return {
                    file: 'permissionElementTypeNotSupported.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "InvalidTypeActivation" /* Protocol.Audits.PermissionElementIssueType.InvalidTypeActivation */:
                return {
                    file: 'permissionElementInvalidTypeActivation.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "SecurityChecksFailed" /* Protocol.Audits.PermissionElementIssueType.SecurityChecksFailed */:
                return {
                    file: 'permissionElementSecurityChecksFailed.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "ActivationDisabled" /* Protocol.Audits.PermissionElementIssueType.ActivationDisabled */: {
                if (this.#issueDetails.occluderNodeInfo && this.#issueDetails.occluderParentNodeInfo) {
                    return {
                        file: 'permissionElementActivationDisabledWithOccluderParent.md',
                        substitutions: new Map([
                            ['PLACEHOLDER_DisableReason', this.#issueDetails.disableReason || ''],
                            ['PLACEHOLDER_OccluderInfo', this.#issueDetails.occluderNodeInfo || ''],
                            ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                            ['PLACEHOLDER_OccluderParentInfo', this.#issueDetails.occluderParentNodeInfo || ''],
                        ]),
                        links: [],
                    };
                }
                if (this.#issueDetails.occluderNodeInfo) {
                    return {
                        file: 'permissionElementActivationDisabledWithOccluder.md',
                        substitutions: new Map([
                            ['PLACEHOLDER_DisableReason', this.#issueDetails.disableReason || ''],
                            ['PLACEHOLDER_OccluderInfo', this.#issueDetails.occluderNodeInfo || ''],
                            ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                        ]),
                        links: [],
                    };
                }
                return {
                    file: 'permissionElementActivationDisabled.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_DisableReason', this.#issueDetails.disableReason || ''],
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            }
            case "GeolocationDeprecated" /* Protocol.Audits.PermissionElementIssueType.GeolocationDeprecated */:
                return {
                    file: 'permissionElementGeolocationDeprecated.md',
                    links: [],
                };
            case "InvalidDisplayStyle" /* Protocol.Audits.PermissionElementIssueType.InvalidDisplayStyle */:
                return {
                    file: 'permissionElementInvalidDisplayStyle.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "NonOpaqueColor" /* Protocol.Audits.PermissionElementIssueType.NonOpaqueColor */:
                return {
                    file: 'permissionElementNonOpaqueColor.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "LowContrast" /* Protocol.Audits.PermissionElementIssueType.LowContrast */:
                return {
                    file: 'permissionElementLowContrast.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "FontSizeTooSmall" /* Protocol.Audits.PermissionElementIssueType.FontSizeTooSmall */:
                return {
                    file: 'permissionElementFontSizeTooSmall.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "FontSizeTooLarge" /* Protocol.Audits.PermissionElementIssueType.FontSizeTooLarge */:
                return {
                    file: 'permissionElementFontSizeTooLarge.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            case "InvalidSizeValue" /* Protocol.Audits.PermissionElementIssueType.InvalidSizeValue */:
                return {
                    file: 'permissionElementInvalidSizeValue.md',
                    substitutions: new Map([
                        ['PLACEHOLDER_Type', this.#issueDetails.type || ''],
                    ]),
                    links: [],
                };
            default:
                console.warn('Unknown PermissionElementIssueType:', issueType);
                return null;
        }
    }
    elements() {
        if (this.#issueDetails.nodeId) {
            const target = this.model()?.target();
            const result = [{
                    backendNodeId: this.#issueDetails.nodeId,
                    nodeName: this.#issueDetails.type || 'Affected element',
                    target: target || null,
                }];
            return result;
        }
        return [];
    }
    getKind() {
        return this.#issueDetails.isWarning ? "Improvement" /* IssueKind.IMPROVEMENT */ : "PageError" /* IssueKind.PAGE_ERROR */;
    }
    primaryKey() {
        return `${"PermissionElementIssue" /* Protocol.Audits.InspectorIssueCode.PermissionElementIssue */}-${JSON.stringify(this.#issueDetails)}`;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const permissionElementIssueDetails = inspectorIssue.details.permissionElementIssueDetails;
        if (!permissionElementIssueDetails) {
            console.warn('Permission element issue without details received.');
            return [];
        }
        return [new PermissionElementIssue(permissionElementIssueDetails, issuesModel)];
    }
}
//# sourceMappingURL=PermissionElementIssue.js.map