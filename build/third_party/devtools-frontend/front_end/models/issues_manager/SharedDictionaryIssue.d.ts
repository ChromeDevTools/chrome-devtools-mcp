import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import { type MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare const enum IssueCode {
    USE_ERROR_CROSS_ORIGIN_NO_CORS_REQUEST = "SharedDictionaryIssue::UseErrorCrossOriginNoCorsRequest",
    USE_ERROR_DICTIONARY_LOAD_FAILURE = "SharedDictionaryIssue::UseErrorDictionaryLoadFailure",
    USE_ERROR_MATCHING_DICTIONARY_NOT_USED = "SharedDictionaryIssue::UseErrorMatchingDictionaryNotUsed",
    USE_ERROR_UNEXPECTED_CONTENT_DICTIONARY_HEADER = "SharedDictionaryIssue::UseErrorUnexpectedContentDictionaryHeader",
    WRITE_ERROR_CROSS_ORIGIN_NO_CORS_REQUEST = "SharedDictionaryIssue::WriteErrorCossOriginNoCorsRequest",
    WRITE_ERROR_DISALLOWED_BY_SETTINGS = "SharedDictionaryIssue::WriteErrorDisallowedBySettings",
    WRITE_ERROR_EXPIRED_RESPONSE = "SharedDictionaryIssue::WriteErrorExpiredResponse",
    WRITE_ERROR_FEATURE_DISABLED = "SharedDictionaryIssue::WriteErrorFeatureDisabled",
    WRITE_ERROR_INSUFFICIENT_RESOURCES = "SharedDictionaryIssue::WriteErrorInsufficientResources",
    WRITE_ERROR_INVALID_MATCH_FIELD = "SharedDictionaryIssue::WriteErrorInvalidMatchField",
    WRITE_ERROR_INVALID_STRUCTURED_HEADER = "SharedDictionaryIssue::WriteErrorInvalidStructuredHeader",
    WRITE_ERROR_INVALID_TTL_FIELD = "SharedDictionaryIssue::WriteErrorInvalidTTLField",
    WRITE_ERROR_NAVIGATION_REQUEST = "SharedDictionaryIssue::WriteErrorNavigationRequest",
    WRITE_ERROR_NO_MATCH_FIELD = "SharedDictionaryIssue::WriteErrorNoMatchField",
    WRITE_ERROR_NON_INTEGER_TTL_FIELD = "SharedDictionaryIssue::WriteErrorNonIntegerTTLField",
    WRITE_ERROR_NON_LIST_MATCH_DEST_FIELD = "SharedDictionaryIssue::WriteErrorNonListMatchDestField",
    WRITE_ERROR_NON_SECURE_CONTEXT = "SharedDictionaryIssue::WriteErrorNonSecureContext",
    WRITE_ERROR_NON_STRING_ID_FIELD = "SharedDictionaryIssue::WriteErrorNonStringIdField",
    WRITE_ERROR_NON_STRING_IN_MATCH_DEST_LIST = "SharedDictionaryIssue::WriteErrorNonStringInMatchDestList",
    WRITE_ERROR_NON_STRING_MATCH_FIELD = "SharedDictionaryIssue::WriteErrorNonStringMatchField",
    WRITE_ERROR_NON_TOKEN_TYPE_FIELD = "SharedDictionaryIssue::WriteErrorNonTokenTypeField",
    WRITE_ERROR_REQUEST_ABORTED = "SharedDictionaryIssue::WriteErrorRequestAborted",
    WRITE_ERROR_SHUTTING_DOWN = "SharedDictionaryIssue::WriteErrorShuttingDown",
    WRITE_ERROR_TOO_LONG_ID_FIELD = "SharedDictionaryIssue::WriteErrorTooLongIdField",
    WRITE_ERROR_UNSUPPORTED_TYPE = "SharedDictionaryIssue::WriteErrorUnsupportedType",
    UNKNOWN = "SharedDictionaryIssue::WriteErrorUnknown"
}
export declare class SharedDictionaryIssue extends Issue<Protocol.Audits.SharedDictionaryIssueDetails, IssueCode> {
    constructor(issueDetails: Protocol.Audits.SharedDictionaryIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel | null);
    requests(): Iterable<Protocol.Audits.AffectedRequest>;
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription | null;
    primaryKey(): string;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel | null, inspectorIssue: Protocol.Audits.InspectorIssue): SharedDictionaryIssue[];
}
