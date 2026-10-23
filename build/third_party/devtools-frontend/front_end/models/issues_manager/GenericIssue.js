// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description Title for autofill documentation page.
     */
    howDoesAutofillWorkPageTitle: 'How does autofill work?',
    /**
     * @description Title for label form elements usage example page.
     */
    labelFormlementsPageTitle: 'The label elements',
    /**
     * @description Title for input form elements usage example page.
     */
    inputFormElementPageTitle: 'The form input element',
    /**
     * @description Title for autocomplete attribute documentation page.
     */
    autocompleteAttributePageTitle: 'HTML attribute: autocomplete',
    /**
     * @description Title for CORB explainer.
     */
    corbExplainerPageTitle: 'CORB explainer',
    /**
     * @description Title for history intervention documentation page.
     */
    historyManipulationInterventionPageTitle: 'History manipulation intervention explainer',
    /**
     * @description Title for back-to-ad intervention documentation page.
     */
    backToAdInterventionPageTitle: 'Back-to-ad intervention explainer',
    /**
     * @description Title for web permissions best practices documentation page.
     */
    permissionsBestPracticesPageTitle: 'Web permissions best practices',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/GenericIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class GenericIssue extends Issue {
    constructor(issueDetails, issuesModel, issueId) {
        const issueCode = [
            "GenericIssue" /* Protocol.Audits.InspectorIssueCode.GenericIssue */,
            issueDetails.errorType,
        ].join('::');
        super(issueCode, issueDetails, issuesModel, issueId);
    }
    requests() {
        const details = this.details();
        if (details.request) {
            return [details.request];
        }
        return [];
    }
    elements() {
        const details = this.details();
        if (details.violatingNodeId) {
            return [{
                    backendNodeId: details.violatingNodeId,
                    nodeName: '',
                    target: this.model()?.target() ?? null,
                }];
        }
        return [];
    }
    getCategory() {
        return "Generic" /* IssueCategory.GENERIC */;
    }
    primaryKey() {
        const details = this.details();
        const requestId = details.request ? details.request.requestId : 'no-request';
        return `${this.code()}-(${details.frameId})-(${details.violatingNodeId})-(${details.violatingNodeAttribute})-(${requestId})`;
    }
    getDescription() {
        const description = issueDescriptions.get(this.details().errorType);
        if (!description) {
            return null;
        }
        return resolveLazyDescription(description);
    }
    getKind() {
        return issueTypes.get(this.details().errorType) || "Improvement" /* IssueKind.IMPROVEMENT */;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const genericDetails = inspectorIssue.details.genericIssueDetails;
        if (!genericDetails) {
            console.warn('Generic issue without details received.');
            return [];
        }
        return [new GenericIssue(genericDetails, issuesModel, inspectorIssue.issueId)];
    }
}
export const genericFormLabelForNameError = {
    file: 'genericFormLabelForNameError.md',
    links: [{
            link: 'https://html.spec.whatwg.org/multipage/forms.html#attr-label-for',
            // Since the link points to a page with the same title, the 'HTML Standard'
            // string doesn't need to be translated.
            linkTitle: i18n.i18n.lockedLazyString('HTML Standard'),
        }],
};
export const genericFormInputWithNoLabelError = {
    file: 'genericFormInputWithNoLabelError.md',
    links: [],
};
export const genericFormAutocompleteAttributeEmptyError = {
    file: 'genericFormAutocompleteAttributeEmptyError.md',
    links: [],
};
export const genericFormDuplicateIdForInputError = {
    file: 'genericFormDuplicateIdForInputError.md',
    links: [{
            link: 'https://web.dev/learn/forms/autofill/#how-does-autofill-work',
            linkTitle: i18nLazyString(UIStrings.howDoesAutofillWorkPageTitle),
        }],
};
export const genericFormAriaLabelledByToNonExistingIdError = {
    file: 'genericFormAriaLabelledByToNonExistingIdError.md',
    links: [{
            link: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label',
            linkTitle: i18nLazyString(UIStrings.labelFormlementsPageTitle),
        }],
};
export const genericFormEmptyIdAndNameAttributesForInputError = {
    file: 'genericFormEmptyIdAndNameAttributesForInputError.md',
    links: [{
            link: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input',
            linkTitle: i18nLazyString(UIStrings.inputFormElementPageTitle),
        }],
};
export const genericFormInputAssignedAutocompleteValueToIdOrNameAttributeError = {
    file: 'genericFormInputAssignedAutocompleteValueToIdOrNameAttributeError.md',
    links: [{
            link: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete#values',
            linkTitle: i18nLazyString(UIStrings.autocompleteAttributePageTitle),
        }],
};
export const genericFormInputHasWrongButWellIntendedAutocompleteValue = {
    file: 'genericFormInputHasWrongButWellIntendedAutocompleteValueError.md',
    links: [{
            link: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete#values',
            linkTitle: i18nLazyString(UIStrings.autocompleteAttributePageTitle),
        }],
};
export const genericFormLabelForMatchesNonExistingIdError = {
    file: 'genericFormLabelForMatchesNonExistingIdError.md',
    links: [{
            link: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label',
            linkTitle: i18nLazyString(UIStrings.labelFormlementsPageTitle),
        }],
};
export const genericFormLabelHasNeitherForNorNestedInputError = {
    file: 'genericFormLabelHasNeitherForNorNestedInputError.md',
    links: [{
            link: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label',
            linkTitle: i18nLazyString(UIStrings.labelFormlementsPageTitle),
        }],
};
export const genericResponseWasBlockedbyORB = {
    file: 'genericResponseWasBlockedByORB.md',
    links: [{
            link: 'https://www.chromium.org/Home/chromium-security/corb-for-developers/',
            linkTitle: i18nLazyString(UIStrings.corbExplainerPageTitle),
        }],
};
export const genericNavigationEntryMarkedSkippable = {
    file: 'genericNavigationEntryMarkedSkippable.md',
    links: [{
            link: 'https://chromium.googlesource.com/chromium/src/+/main/docs/history_manipulation_intervention.md',
            linkTitle: i18nLazyString(UIStrings.historyManipulationInterventionPageTitle),
        }],
};
export const genericBackUINavigationWouldSkipAd = {
    file: 'genericBackUINavigationWouldSkipAd.md',
    links: [{
            link: 'https://chromium.googlesource.com/chromium/src/+/main/docs/history_manipulation_intervention.md',
            linkTitle: i18nLazyString(UIStrings.backToAdInterventionPageTitle),
        }],
};
export const genericFormModelContextMissingToolName = {
    file: 'genericFormModelContextMissingToolName.md',
    links: [],
};
export const genericFormModelContextMissingToolDescription = {
    file: 'genericFormModelContextMissingToolDescription.md',
    links: [],
};
export const genericFormModelContextParameterMissingTitleAndDescription = {
    file: 'genericFormModelContextParameterMissingTitleAndDescription.md',
    links: [],
};
export const genericFormModelContextRequiredParameterMissingName = {
    file: 'genericFormModelContextRequiredParameterMissingName.md',
    links: [],
};
export const genericFormModelContextParameterMissingName = {
    file: 'genericFormModelContextParameterMissingName.md',
    links: [],
};
export const genericGeolocationPromptWithoutUserGesture = {
    file: 'genericGeolocationPromptWithoutUserGesture.md',
    links: [{
            link: 'https://web.dev/articles/permissions-best-practices',
            linkTitle: i18nLazyString(UIStrings.permissionsBestPracticesPageTitle),
        }],
};
const issueDescriptions = new Map([
    ["FormLabelForNameError" /* Protocol.Audits.GenericIssueErrorType.FormLabelForNameError */, genericFormLabelForNameError],
    ["FormInputWithNoLabelError" /* Protocol.Audits.GenericIssueErrorType.FormInputWithNoLabelError */, genericFormInputWithNoLabelError],
    [
        "FormAutocompleteAttributeEmptyError" /* Protocol.Audits.GenericIssueErrorType.FormAutocompleteAttributeEmptyError */,
        genericFormAutocompleteAttributeEmptyError,
    ],
    ["FormDuplicateIdForInputError" /* Protocol.Audits.GenericIssueErrorType.FormDuplicateIdForInputError */, genericFormDuplicateIdForInputError],
    [
        "FormAriaLabelledByToNonExistingIdError" /* Protocol.Audits.GenericIssueErrorType.FormAriaLabelledByToNonExistingIdError */,
        genericFormAriaLabelledByToNonExistingIdError,
    ],
    [
        "FormEmptyIdAndNameAttributesForInputError" /* Protocol.Audits.GenericIssueErrorType.FormEmptyIdAndNameAttributesForInputError */,
        genericFormEmptyIdAndNameAttributesForInputError,
    ],
    [
        "FormInputAssignedAutocompleteValueToIdOrNameAttributeError" /* Protocol.Audits.GenericIssueErrorType.FormInputAssignedAutocompleteValueToIdOrNameAttributeError */,
        genericFormInputAssignedAutocompleteValueToIdOrNameAttributeError,
    ],
    [
        "FormLabelForMatchesNonExistingIdError" /* Protocol.Audits.GenericIssueErrorType.FormLabelForMatchesNonExistingIdError */,
        genericFormLabelForMatchesNonExistingIdError,
    ],
    [
        "FormLabelHasNeitherForNorNestedInputError" /* Protocol.Audits.GenericIssueErrorType.FormLabelHasNeitherForNorNestedInputError */,
        genericFormLabelHasNeitherForNorNestedInputError,
    ],
    [
        "FormInputHasWrongButWellIntendedAutocompleteValueError" /* Protocol.Audits.GenericIssueErrorType.FormInputHasWrongButWellIntendedAutocompleteValueError */,
        genericFormInputHasWrongButWellIntendedAutocompleteValue,
    ],
    [
        "ResponseWasBlockedByORB" /* Protocol.Audits.GenericIssueErrorType.ResponseWasBlockedByORB */,
        genericResponseWasBlockedbyORB,
    ],
    [
        "NavigationEntryMarkedSkippable" /* Protocol.Audits.GenericIssueErrorType.NavigationEntryMarkedSkippable */,
        genericNavigationEntryMarkedSkippable,
    ],
    [
        "BackUINavigationWouldSkipAd" /* Protocol.Audits.GenericIssueErrorType.BackUINavigationWouldSkipAd */,
        genericBackUINavigationWouldSkipAd,
    ],
    [
        "FormModelContextMissingToolName" /* Protocol.Audits.GenericIssueErrorType.FormModelContextMissingToolName */,
        genericFormModelContextMissingToolName,
    ],
    [
        "FormModelContextMissingToolDescription" /* Protocol.Audits.GenericIssueErrorType.FormModelContextMissingToolDescription */,
        genericFormModelContextMissingToolDescription,
    ],
    [
        "FormModelContextParameterMissingTitleAndDescription" /* Protocol.Audits.GenericIssueErrorType.FormModelContextParameterMissingTitleAndDescription */,
        genericFormModelContextParameterMissingTitleAndDescription,
    ],
    [
        "FormModelContextRequiredParameterMissingName" /* Protocol.Audits.GenericIssueErrorType.FormModelContextRequiredParameterMissingName */,
        genericFormModelContextRequiredParameterMissingName,
    ],
    [
        "FormModelContextParameterMissingName" /* Protocol.Audits.GenericIssueErrorType.FormModelContextParameterMissingName */,
        genericFormModelContextParameterMissingName,
    ],
    [
        "GeolocationPromptWithoutUserGesture" /* Protocol.Audits.GenericIssueErrorType.GeolocationPromptWithoutUserGesture */,
        genericGeolocationPromptWithoutUserGesture,
    ],
]);
const issueTypes = new Map([
    ["FormLabelForNameError" /* Protocol.Audits.GenericIssueErrorType.FormLabelForNameError */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["FormInputWithNoLabelError" /* Protocol.Audits.GenericIssueErrorType.FormInputWithNoLabelError */, "Improvement" /* IssueKind.IMPROVEMENT */],
    ["FormAutocompleteAttributeEmptyError" /* Protocol.Audits.GenericIssueErrorType.FormAutocompleteAttributeEmptyError */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["FormDuplicateIdForInputError" /* Protocol.Audits.GenericIssueErrorType.FormDuplicateIdForInputError */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["FormAriaLabelledByToNonExistingIdError" /* Protocol.Audits.GenericIssueErrorType.FormAriaLabelledByToNonExistingIdError */, "Improvement" /* IssueKind.IMPROVEMENT */],
    ["FormEmptyIdAndNameAttributesForInputError" /* Protocol.Audits.GenericIssueErrorType.FormEmptyIdAndNameAttributesForInputError */, "Improvement" /* IssueKind.IMPROVEMENT */],
    [
        "FormInputAssignedAutocompleteValueToIdOrNameAttributeError" /* Protocol.Audits.GenericIssueErrorType.FormInputAssignedAutocompleteValueToIdOrNameAttributeError */,
        "Improvement" /* IssueKind.IMPROVEMENT */,
    ],
    ["FormLabelForMatchesNonExistingIdError" /* Protocol.Audits.GenericIssueErrorType.FormLabelForMatchesNonExistingIdError */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["FormLabelHasNeitherForNorNestedInputError" /* Protocol.Audits.GenericIssueErrorType.FormLabelHasNeitherForNorNestedInputError */, "Improvement" /* IssueKind.IMPROVEMENT */],
    ["FormInputHasWrongButWellIntendedAutocompleteValueError" /* Protocol.Audits.GenericIssueErrorType.FormInputHasWrongButWellIntendedAutocompleteValueError */, "Improvement" /* IssueKind.IMPROVEMENT */],
    ["FormModelContextMissingToolName" /* Protocol.Audits.GenericIssueErrorType.FormModelContextMissingToolName */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["FormModelContextMissingToolDescription" /* Protocol.Audits.GenericIssueErrorType.FormModelContextMissingToolDescription */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["FormModelContextParameterMissingTitleAndDescription" /* Protocol.Audits.GenericIssueErrorType.FormModelContextParameterMissingTitleAndDescription */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["FormModelContextRequiredParameterMissingName" /* Protocol.Audits.GenericIssueErrorType.FormModelContextRequiredParameterMissingName */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["FormModelContextParameterMissingName" /* Protocol.Audits.GenericIssueErrorType.FormModelContextParameterMissingName */, "PageError" /* IssueKind.PAGE_ERROR */],
    ["GeolocationPromptWithoutUserGesture" /* Protocol.Audits.GenericIssueErrorType.GeolocationPromptWithoutUserGesture */, "Improvement" /* IssueKind.IMPROVEMENT */],
]);
//# sourceMappingURL=GenericIssue.js.map