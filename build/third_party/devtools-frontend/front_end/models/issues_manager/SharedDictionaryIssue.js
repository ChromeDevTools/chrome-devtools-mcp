// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription, } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description Title for Compression Dictionary Transport specification URL link.
     */
    compressionDictionaryTransport: 'Compression Dictionary Transport',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/SharedDictionaryIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
function getIssueCode(details) {
    switch (details.sharedDictionaryError) {
        case "UseErrorCrossOriginNoCorsRequest" /* Protocol.Audits.SharedDictionaryError.UseErrorCrossOriginNoCorsRequest */:
            return "SharedDictionaryIssue::UseErrorCrossOriginNoCorsRequest" /* IssueCode.USE_ERROR_CROSS_ORIGIN_NO_CORS_REQUEST */;
        case "UseErrorDictionaryLoadFailure" /* Protocol.Audits.SharedDictionaryError.UseErrorDictionaryLoadFailure */:
            return "SharedDictionaryIssue::UseErrorDictionaryLoadFailure" /* IssueCode.USE_ERROR_DICTIONARY_LOAD_FAILURE */;
        case "UseErrorMatchingDictionaryNotUsed" /* Protocol.Audits.SharedDictionaryError.UseErrorMatchingDictionaryNotUsed */:
            return "SharedDictionaryIssue::UseErrorMatchingDictionaryNotUsed" /* IssueCode.USE_ERROR_MATCHING_DICTIONARY_NOT_USED */;
        case "UseErrorUnexpectedContentDictionaryHeader" /* Protocol.Audits.SharedDictionaryError.UseErrorUnexpectedContentDictionaryHeader */:
            return "SharedDictionaryIssue::UseErrorUnexpectedContentDictionaryHeader" /* IssueCode.USE_ERROR_UNEXPECTED_CONTENT_DICTIONARY_HEADER */;
        case "WriteErrorCossOriginNoCorsRequest" /* Protocol.Audits.SharedDictionaryError.WriteErrorCossOriginNoCorsRequest */:
            return "SharedDictionaryIssue::WriteErrorCossOriginNoCorsRequest" /* IssueCode.WRITE_ERROR_CROSS_ORIGIN_NO_CORS_REQUEST */;
        case "WriteErrorDisallowedBySettings" /* Protocol.Audits.SharedDictionaryError.WriteErrorDisallowedBySettings */:
            return "SharedDictionaryIssue::WriteErrorDisallowedBySettings" /* IssueCode.WRITE_ERROR_DISALLOWED_BY_SETTINGS */;
        case "WriteErrorExpiredResponse" /* Protocol.Audits.SharedDictionaryError.WriteErrorExpiredResponse */:
            return "SharedDictionaryIssue::WriteErrorExpiredResponse" /* IssueCode.WRITE_ERROR_EXPIRED_RESPONSE */;
        case "WriteErrorFeatureDisabled" /* Protocol.Audits.SharedDictionaryError.WriteErrorFeatureDisabled */:
            return "SharedDictionaryIssue::WriteErrorFeatureDisabled" /* IssueCode.WRITE_ERROR_FEATURE_DISABLED */;
        case "WriteErrorInsufficientResources" /* Protocol.Audits.SharedDictionaryError.WriteErrorInsufficientResources */:
            return "SharedDictionaryIssue::WriteErrorInsufficientResources" /* IssueCode.WRITE_ERROR_INSUFFICIENT_RESOURCES */;
        case "WriteErrorInvalidMatchField" /* Protocol.Audits.SharedDictionaryError.WriteErrorInvalidMatchField */:
            return "SharedDictionaryIssue::WriteErrorInvalidMatchField" /* IssueCode.WRITE_ERROR_INVALID_MATCH_FIELD */;
        case "WriteErrorInvalidStructuredHeader" /* Protocol.Audits.SharedDictionaryError.WriteErrorInvalidStructuredHeader */:
            return "SharedDictionaryIssue::WriteErrorInvalidStructuredHeader" /* IssueCode.WRITE_ERROR_INVALID_STRUCTURED_HEADER */;
        case "WriteErrorInvalidTTLField" /* Protocol.Audits.SharedDictionaryError.WriteErrorInvalidTTLField */:
            return "SharedDictionaryIssue::WriteErrorInvalidTTLField" /* IssueCode.WRITE_ERROR_INVALID_TTL_FIELD */;
        case "WriteErrorNavigationRequest" /* Protocol.Audits.SharedDictionaryError.WriteErrorNavigationRequest */:
            return "SharedDictionaryIssue::WriteErrorNavigationRequest" /* IssueCode.WRITE_ERROR_NAVIGATION_REQUEST */;
        case "WriteErrorNoMatchField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNoMatchField */:
            return "SharedDictionaryIssue::WriteErrorNoMatchField" /* IssueCode.WRITE_ERROR_NO_MATCH_FIELD */;
        case "WriteErrorNonIntegerTTLField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonIntegerTTLField */:
            return "SharedDictionaryIssue::WriteErrorNonIntegerTTLField" /* IssueCode.WRITE_ERROR_NON_INTEGER_TTL_FIELD */;
        case "WriteErrorNonListMatchDestField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonListMatchDestField */:
            return "SharedDictionaryIssue::WriteErrorNonListMatchDestField" /* IssueCode.WRITE_ERROR_NON_LIST_MATCH_DEST_FIELD */;
        case "WriteErrorNonSecureContext" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonSecureContext */:
            return "SharedDictionaryIssue::WriteErrorNonSecureContext" /* IssueCode.WRITE_ERROR_NON_SECURE_CONTEXT */;
        case "WriteErrorNonStringIdField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonStringIdField */:
            return "SharedDictionaryIssue::WriteErrorNonStringIdField" /* IssueCode.WRITE_ERROR_NON_STRING_ID_FIELD */;
        case "WriteErrorNonStringInMatchDestList" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonStringInMatchDestList */:
            return "SharedDictionaryIssue::WriteErrorNonStringInMatchDestList" /* IssueCode.WRITE_ERROR_NON_STRING_IN_MATCH_DEST_LIST */;
        case "WriteErrorNonStringMatchField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonStringMatchField */:
            return "SharedDictionaryIssue::WriteErrorNonStringMatchField" /* IssueCode.WRITE_ERROR_NON_STRING_MATCH_FIELD */;
        case "WriteErrorNonTokenTypeField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonTokenTypeField */:
            return "SharedDictionaryIssue::WriteErrorNonTokenTypeField" /* IssueCode.WRITE_ERROR_NON_TOKEN_TYPE_FIELD */;
        case "WriteErrorRequestAborted" /* Protocol.Audits.SharedDictionaryError.WriteErrorRequestAborted */:
            return "SharedDictionaryIssue::WriteErrorRequestAborted" /* IssueCode.WRITE_ERROR_REQUEST_ABORTED */;
        case "WriteErrorShuttingDown" /* Protocol.Audits.SharedDictionaryError.WriteErrorShuttingDown */:
            return "SharedDictionaryIssue::WriteErrorShuttingDown" /* IssueCode.WRITE_ERROR_SHUTTING_DOWN */;
        case "WriteErrorTooLongIdField" /* Protocol.Audits.SharedDictionaryError.WriteErrorTooLongIdField */:
            return "SharedDictionaryIssue::WriteErrorTooLongIdField" /* IssueCode.WRITE_ERROR_TOO_LONG_ID_FIELD */;
        case "WriteErrorUnsupportedType" /* Protocol.Audits.SharedDictionaryError.WriteErrorUnsupportedType */:
            return "SharedDictionaryIssue::WriteErrorUnsupportedType" /* IssueCode.WRITE_ERROR_UNSUPPORTED_TYPE */;
        default:
            return "SharedDictionaryIssue::WriteErrorUnknown" /* IssueCode.UNKNOWN */;
    }
}
export class SharedDictionaryIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super({
            code: getIssueCode(issueDetails),
            umaCode: [
                "SharedDictionaryIssue" /* Protocol.Audits.InspectorIssueCode.SharedDictionaryIssue */,
                issueDetails.sharedDictionaryError,
            ].join('::'),
        }, issueDetails, issuesModel);
    }
    requests() {
        if (this.details().request) {
            return [this.details().request];
        }
        return [];
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        const description = issueDescriptions.get(this.details().sharedDictionaryError);
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
        const details = inspectorIssue.details.sharedDictionaryIssueDetails;
        if (!details) {
            console.warn('Shared Dictionary issue without details received.');
            return [];
        }
        return [new SharedDictionaryIssue(details, issuesModel)];
    }
}
const specLinks = [{
        link: 'https://datatracker.ietf.org/doc/draft-ietf-httpbis-compression-dictionary/',
        linkTitle: i18nLazyString(UIStrings.compressionDictionaryTransport),
    }];
const issueDescriptions = new Map([
    [
        "UseErrorCrossOriginNoCorsRequest" /* Protocol.Audits.SharedDictionaryError.UseErrorCrossOriginNoCorsRequest */,
        {
            file: 'sharedDictionaryUseErrorCrossOriginNoCorsRequest.md',
            links: specLinks,
        },
    ],
    [
        "UseErrorDictionaryLoadFailure" /* Protocol.Audits.SharedDictionaryError.UseErrorDictionaryLoadFailure */,
        {
            file: 'sharedDictionaryUseErrorDictionaryLoadFailure.md',
            links: specLinks,
        },
    ],
    [
        "UseErrorMatchingDictionaryNotUsed" /* Protocol.Audits.SharedDictionaryError.UseErrorMatchingDictionaryNotUsed */,
        {
            file: 'sharedDictionaryUseErrorMatchingDictionaryNotUsed.md',
            links: specLinks,
        },
    ],
    [
        "UseErrorUnexpectedContentDictionaryHeader" /* Protocol.Audits.SharedDictionaryError.UseErrorUnexpectedContentDictionaryHeader */,
        {
            file: 'sharedDictionaryUseErrorUnexpectedContentDictionaryHeader.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorCossOriginNoCorsRequest" /* Protocol.Audits.SharedDictionaryError.WriteErrorCossOriginNoCorsRequest */,
        {
            file: 'sharedDictionaryWriteErrorCossOriginNoCorsRequest.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorDisallowedBySettings" /* Protocol.Audits.SharedDictionaryError.WriteErrorDisallowedBySettings */,
        {
            file: 'sharedDictionaryWriteErrorDisallowedBySettings.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorExpiredResponse" /* Protocol.Audits.SharedDictionaryError.WriteErrorExpiredResponse */,
        {
            file: 'sharedDictionaryWriteErrorExpiredResponse.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorFeatureDisabled" /* Protocol.Audits.SharedDictionaryError.WriteErrorFeatureDisabled */,
        {
            file: 'sharedDictionaryWriteErrorFeatureDisabled.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorInsufficientResources" /* Protocol.Audits.SharedDictionaryError.WriteErrorInsufficientResources */,
        {
            file: 'sharedDictionaryWriteErrorInsufficientResources.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorInvalidMatchField" /* Protocol.Audits.SharedDictionaryError.WriteErrorInvalidMatchField */,
        {
            file: 'sharedDictionaryWriteErrorInvalidMatchField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorInvalidStructuredHeader" /* Protocol.Audits.SharedDictionaryError.WriteErrorInvalidStructuredHeader */,
        {
            file: 'sharedDictionaryWriteErrorInvalidStructuredHeader.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorInvalidTTLField" /* Protocol.Audits.SharedDictionaryError.WriteErrorInvalidTTLField */,
        {
            file: 'sharedDictionaryWriteErrorInvalidTTLField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNavigationRequest" /* Protocol.Audits.SharedDictionaryError.WriteErrorNavigationRequest */,
        {
            file: 'sharedDictionaryWriteErrorNavigationRequest.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNoMatchField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNoMatchField */,
        {
            file: 'sharedDictionaryWriteErrorNoMatchField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNonIntegerTTLField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonIntegerTTLField */,
        {
            file: 'sharedDictionaryWriteErrorNonIntegerTTLField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNonListMatchDestField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonListMatchDestField */,
        {
            file: 'sharedDictionaryWriteErrorNonListMatchDestField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNonSecureContext" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonSecureContext */,
        {
            file: 'sharedDictionaryWriteErrorNonSecureContext.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNonStringIdField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonStringIdField */,
        {
            file: 'sharedDictionaryWriteErrorNonStringIdField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNonStringInMatchDestList" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonStringInMatchDestList */,
        {
            file: 'sharedDictionaryWriteErrorNonStringInMatchDestList.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNonStringMatchField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonStringMatchField */,
        {
            file: 'sharedDictionaryWriteErrorNonStringMatchField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorNonTokenTypeField" /* Protocol.Audits.SharedDictionaryError.WriteErrorNonTokenTypeField */,
        {
            file: 'sharedDictionaryWriteErrorNonTokenTypeField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorRequestAborted" /* Protocol.Audits.SharedDictionaryError.WriteErrorRequestAborted */,
        {
            file: 'sharedDictionaryWriteErrorRequestAborted.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorShuttingDown" /* Protocol.Audits.SharedDictionaryError.WriteErrorShuttingDown */,
        {
            file: 'sharedDictionaryWriteErrorShuttingDown.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorTooLongIdField" /* Protocol.Audits.SharedDictionaryError.WriteErrorTooLongIdField */,
        {
            file: 'sharedDictionaryWriteErrorTooLongIdField.md',
            links: specLinks,
        },
    ],
    [
        "WriteErrorUnsupportedType" /* Protocol.Audits.SharedDictionaryError.WriteErrorUnsupportedType */,
        {
            file: 'sharedDictionaryWriteErrorUnsupportedType.md',
            links: specLinks,
        },
    ],
]);
//# sourceMappingURL=SharedDictionaryIssue.js.map