import * as Common from '../../core/common/common.js';
import type * as Protocol from '../../generated/protocol.js';
import { ContentSecurityPolicyIssue } from './ContentSecurityPolicyIssue.js';
import { CookieDeprecationMetadataIssue } from './CookieDeprecationMetadataIssue.js';
import { CorsIssue } from './CorsIssue.js';
import { DeprecationIssue } from './DeprecationIssue.js';
import { ElementAccessibilityIssue } from './ElementAccessibilityIssue.js';
import { GenericIssue } from './GenericIssue.js';
import { HeavyAdIssue } from './HeavyAdIssue.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { EventTypes as IssuesManagerEventsTypes } from './IssuesManager.js';
import { LazyLoadImageIssue } from './LazyLoadImageIssue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
import { MixedContentIssue } from './MixedContentIssue.js';
import { PartitioningBlobURLIssue } from './PartitioningBlobURLIssue.js';
import { PermissionElementIssue } from './PermissionElementIssue.js';
import { QuirksModeIssue } from './QuirksModeIssue.js';
import { SelectivePermissionsInterventionIssue } from './SelectivePermissionsInterventionIssue.js';
import { SharedArrayBufferIssue } from './SharedArrayBufferIssue.js';
export interface IssuesProvider extends Common.EventTarget.EventTarget<IssuesManagerEventsTypes> {
    issues(): Iterable<Issue>;
}
interface AggregationKeyTag {
    aggregationKeyTag: undefined;
}
/**
 * An opaque type for the key which we use to aggregate issues. The key must be
 * chosen such that if two aggregated issues have the same aggregation key, then
 * they also have the same issue code.
 */
export type AggregationKey = {
    toString(): string;
} & AggregationKeyTag;
/**
 * An `AggregatedIssue` representes a number of `IssuesManager.Issue.Issue` objects that are displayed together.
 * Currently only grouping by issue code, is supported. The class provides helpers to support displaying
 * of all resources that are affected by the aggregated issues.
 */
export declare class AggregatedIssue extends Issue {
    #private;
    constructor(code: string, aggregationKey: AggregationKey);
    primaryKey(): string;
    aggregationKey(): AggregationKey;
    getBlockedByResponseDetails(): Iterable<Protocol.Audits.BlockedByResponseIssueDetails>;
    cookies(): Iterable<Protocol.Audits.AffectedCookie>;
    getRawCookieLines(): Iterable<{
        rawCookieLine: string;
        hasRequest: boolean;
    }>;
    sources(): Iterable<Protocol.Audits.SourceCodeLocation>;
    getBounceTrackingSites(): Iterable<string>;
    cookiesWithRequestIndicator(): Iterable<{
        cookie: Protocol.Audits.AffectedCookie;
        hasRequest: boolean;
    }>;
    getHeavyAdIssues(): Iterable<HeavyAdIssue>;
    getCookieDeprecationMetadataIssues(): Iterable<CookieDeprecationMetadataIssue>;
    getMixedContentIssues(): Iterable<MixedContentIssue>;
    getCorsIssues(): Set<CorsIssue>;
    getCspIssues(): Iterable<ContentSecurityPolicyIssue>;
    getDeprecationIssues(): Iterable<DeprecationIssue>;
    requests(): Iterable<Protocol.Audits.AffectedRequest>;
    getSelectivePermissionsInterventionIssues(): Iterable<SelectivePermissionsInterventionIssue>;
    getSharedArrayBufferIssues(): Iterable<SharedArrayBufferIssue>;
    getQuirksModeIssues(): Iterable<QuirksModeIssue>;
    getGenericIssues(): ReadonlySet<GenericIssue>;
    getElementAccessibilityIssues(): Iterable<ElementAccessibilityIssue>;
    getDescription(): MarkdownIssueDescription | null;
    getCategory(): IssueCategory;
    getAggregatedIssuesCount(): number;
    getPartitioningBlobURLIssues(): Iterable<PartitioningBlobURLIssue>;
    getPermissionElementIssues(): Iterable<PermissionElementIssue>;
    getLazyLoadImageIssues(): Iterable<LazyLoadImageIssue>;
    addInstance(issue: Issue): void;
    getKind(): IssueKind;
    getAllIssues(): Issue[];
    isHidden(): boolean;
    setHidden(_value: boolean): void;
}
export declare class IssueAggregator extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    private readonly issuesManager;
    constructor(issuesManager: IssuesProvider);
    aggregatedIssues(): Iterable<AggregatedIssue>;
    aggregatedIssueCodes(): Set<AggregationKey>;
    aggregatedIssueCategories(): Set<IssueCategory>;
    aggregatedIssueKinds(): Set<IssueKind>;
    numberOfAggregatedIssues(): number;
    numberOfHiddenAggregatedIssues(): number;
    keyForIssue(issue: Issue): AggregationKey;
}
export declare const enum Events {
    AGGREGATED_ISSUE_UPDATED = "AggregatedIssueUpdated",
    FULL_UPDATE_REQUIRED = "FullUpdateRequired"
}
export interface EventTypes {
    [Events.AGGREGATED_ISSUE_UPDATED]: AggregatedIssue;
    [Events.FULL_UPDATE_REQUIRED]: void;
}
export {};
