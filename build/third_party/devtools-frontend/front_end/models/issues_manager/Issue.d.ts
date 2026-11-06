import type * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare const enum IssueCategory {
    CROSS_ORIGIN_EMBEDDER_POLICY = "CrossOriginEmbedderPolicy",
    GENERIC = "Generic",
    MIXED_CONTENT = "MixedContent",
    COOKIE = "Cookie",
    HEAVY_AD = "HeavyAd",
    CONTENT_SECURITY_POLICY = "ContentSecurityPolicy",
    LOW_TEXT_CONTRAST = "LowTextContrast",
    CORS = "Cors",
    QUIRKS_MODE = "QuirksMode",
    PERMISSION_ELEMENT = "PermissionElement",
    SELECTIVE_PERMISSIONS_INTERVENTION = "SelectivePermissionsIntervention",
    OTHER = "Other"
}
export declare const enum IssueKind {
    /**
     * Something is not working in the page right now. Issues of this kind need
     * usually be fixed right away. They usually indicate that a Web API is being
     * used in a wrong way, or that a network request was misconfigured.
     */
    PAGE_ERROR = "PageError",
    /**
     * The page is using a Web API or relying on browser behavior that is going
     * to change in the future. If possible, the message associated with issues
     * of this kind should include a time when the behavior is going to change.
     */
    BREAKING_CHANGE = "BreakingChange",
    /**
     * Anything that can be improved about the page, but isn't urgent and doesn't
     * impair functionality in a major way.
     */
    IMPROVEMENT = "Improvement"
}
export declare function getIssueKindName(issueKind: IssueKind): Common.UIString.LocalizedString;
export declare function getIssueKindDescription(issueKind: IssueKind): Common.UIString.LocalizedString;
/**
 * Union two issue kinds for issue aggregation. The idea is to show the most
 * important kind on aggregated issues that union issues of different kinds.
 */
export declare function unionIssueKind(a: IssueKind, b: IssueKind): IssueKind;
export declare function getShowThirdPartyIssuesSetting(settings: Common.Settings.Settings): Common.Settings.Setting<boolean>;
export interface AffectedElement {
    backendNodeId: Protocol.DOM.BackendNodeId;
    nodeName: string;
    target: SDK.Target.Target | null;
}
export type ValidIssueDetails = NonNullable<Protocol.Audits.InspectorIssueDetails[keyof Protocol.Audits.InspectorIssueDetails]>;
export declare abstract class Issue<IssueDetails extends ValidIssueDetails | null = ValidIssueDetails | null, IssueCode extends string = string> {
    #private;
    protected issueId: Protocol.Audits.IssueId | undefined;
    constructor(code: IssueCode | {
        code: IssueCode;
        umaCode: string;
    }, issueDetails: IssueDetails, issuesModel?: SDK.IssuesModel.IssuesModel | null, issueId?: Protocol.Audits.IssueId);
    code(): IssueCode;
    abstract primaryKey(): string;
    abstract getDescription(): MarkdownIssueDescription | null;
    abstract getCategory(): IssueCategory;
    abstract getKind(): IssueKind;
    details(): IssueDetails;
    getBlockedByResponseDetails(): Iterable<Protocol.Audits.BlockedByResponseIssueDetails>;
    cookies(): Iterable<Protocol.Audits.AffectedCookie>;
    rawCookieLines(): Iterable<string>;
    elements(): Iterable<AffectedElement>;
    requests(): Iterable<Protocol.Audits.AffectedRequest>;
    sources(): Iterable<Protocol.Audits.SourceCodeLocation>;
    trackingSites(): Iterable<string>;
    isAssociatedWithRequestId(requestId: string): boolean;
    /**
     * The model might be unavailable or belong to a target that has already been disposed.
     */
    model(): SDK.IssuesModel.IssuesModel | null;
    isCausedByThirdParty(): boolean;
    getIssueId(): Protocol.Audits.IssueId | undefined;
    isHidden(): boolean;
    setHidden(hidden: boolean): void;
    maybeCreateConsoleMessage(): SDK.ConsoleModel.ConsoleMessage | undefined;
}
export declare function toZeroBasedLocation(location: Protocol.Audits.SourceCodeLocation | undefined): {
    url: Platform.DevToolsPath.UrlString;
    scriptId: Protocol.Runtime.ScriptId | undefined;
    lineNumber: number;
    columnNumber: number | undefined;
} | undefined;
